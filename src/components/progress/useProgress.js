import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { fetchAll } from '@/lib/fetchAll';
import manifest from '@/lib/progress/pageManifest.json';

// Data layer for the Progress Control Center.
//
// Two sources feed the surfaces:
//   1. ProgressPage and friends, the live records.
//   2. The generated manifest, which lets the Application Review tree render the
//      complete route inventory even before the first sync has run. A page that
//      exists in the router but has no record yet is shown as unregistered
//      rather than being silently absent, because a missing surface is exactly
//      the kind of thing this system is meant to catch.

const list = (entity, order = '-created_date') =>
  fetchAll((limit, skip) => base44.entities[entity].list(order, limit, skip));

const STALE = 60 * 1000;

export function useProgressPages() {
  return useQuery({
    queryKey: ['progress-pages'],
    queryFn: () => list('ProgressPage'),
    staleTime: STALE,
  });
}

export function useProgressFindings() {
  return useQuery({
    queryKey: ['progress-findings'],
    queryFn: () => list('AuditFinding'),
    staleTime: STALE,
  });
}

export function useReviewThreads() {
  return useQuery({
    queryKey: ['progress-threads'],
    queryFn: () => list('ReviewThread'),
    staleTime: STALE,
  });
}

export function useChangeRequests() {
  return useQuery({
    queryKey: ['progress-changes'],
    queryFn: () => list('ChangeRequest'),
    staleTime: STALE,
  });
}

export function usePromptDrafts() {
  return useQuery({
    queryKey: ['progress-prompts'],
    queryFn: () => list('PromptDraft'),
    staleTime: STALE,
  });
}

export function useReleaseGates() {
  return useQuery({
    queryKey: ['progress-gates'],
    queryFn: () => list('ReleaseGate', 'sort_order'),
    staleTime: STALE,
  });
}

export function useMigrationRequirements() {
  return useQuery({
    queryKey: ['progress-migration'],
    queryFn: () => list('MigrationRequirement', 'sort_order'),
    staleTime: STALE,
  });
}

export function useVerificationRecords() {
  return useQuery({
    queryKey: ['progress-verifications'],
    queryFn: () => list('VerificationRecord'),
    staleTime: STALE,
  });
}

export function useProgressSnapshots() {
  return useQuery({
    queryKey: ['progress-snapshots'],
    queryFn: () => list('ProgressSnapshot', '-snapshot_date'),
    staleTime: STALE,
  });
}

export function usePageSnapshots() {
  return useQuery({
    queryKey: ['progress-page-snapshots'],
    queryFn: () => list('PageSnapshot', '-captured_at'),
    staleTime: 15 * 1000,
  });
}

// The manifest is a build artefact, so it never changes at runtime.
export function usePageManifest() {
  return manifest;
}

// Recalculate readiness. This is the only way the UI may move a readiness score:
// the client never computes and writes one itself.
export function useRecalculate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body = {}) => {
      const res = await base44.functions.invoke('progressReadiness', body);
      return res.data;
    },
    onSuccess: () => {
      ['progress-pages', 'progress-gates', 'progress-snapshots'].forEach((k) =>
        qc.invalidateQueries({ queryKey: [k] }));
    },
  });
}

// Re-sync the page inventory from the generated manifest.
export function useSyncInventory() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body = {}) => {
      const res = await base44.functions.invoke('progressSync', body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['progress-pages'] }),
  });
}

export function useGeneratePrompt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body) => {
      const res = await base44.functions.invoke('progressPrompt', body);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['progress-prompts'] });
      qc.invalidateQueries({ queryKey: ['progress-changes'] });
    },
  });
}

// Generic record writer for the review surfaces.
export function useProgressMutation(entity, queryKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ action, id, data }) => {
      if (action === 'create') return base44.entities[entity].create(data);
      if (action === 'update') return base44.entities[entity].update(id, data);
      if (action === 'delete') return base44.entities[entity].delete(id);
      throw new Error(`Unsupported action ${action}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: [queryKey] }),
  });
}

export const parseJson = (value, fallback) => {
  if (value == null) return fallback;
  if (typeof value !== 'string') return value;
  try { return JSON.parse(value); } catch { return fallback; }
};

// How much human judgement a record carries. When two records share a page_key
// (a race between a sync and another writer) the UI must not pick arbitrarily,
// or an assessed page silently reads as never started. Prefer the richer record
// until progressSync collapses them properly.
function assessmentDepth(rec) {
  if (!rec) return -1;
  let score = 0;
  if (rec.lifecycle_status && rec.lifecycle_status !== 'not_started') score += 4;
  if (rec.criticality && rec.criticality !== 'normal') score += 3;
  if (rec.purpose) score += 2;
  if (rec.gaps) score += 2;
  if (rec.strengths) score += 1;
  if (rec.human_notes) score += 1;
  if (rec.migration_required != null) score += 1;
  if (rec.leadbyte_equivalent) score += 1;
  if (rec.dimension_scores) score += 2;
  return score;
}

// Only the keys that actually carry a value. Spreading a whole record over the
// manifest lets a null on the record wipe out a real generated value, which is
// how route_type, host_scope, auth and roles all ended up reading "not set" and
// why the capture queue filtered down to nothing.
function defined(obj) {
  const out = {};
  Object.entries(obj || {}).forEach(([k, v]) => {
    if (v === null || v === undefined || v === '') return;
    out[k] = v;
  });
  return out;
}

// Merge records with the manifest so unregistered routes stay visible.
//
// Field level, not record level. The manifest supplies the generated truth, then
// every record for that key is layered on in order of how much human judgement it
// carries, contributing only the fields it actually has. Two records for one key
// therefore combine (generated fields from one, assessment from the other)
// instead of one silently winning.
export function mergePagesWithManifest(records = [], manifestPages = manifest.pages) {
  const byKey = new Map();
  (records || []).forEach((r) => {
    const list = byKey.get(r.page_key) || [];
    list.push(r);
    byKey.set(r.page_key, list);
  });

  const duplicateKeys = [];
  byKey.forEach((list, key) => {
    if (list.length > 1) duplicateKeys.push(key);
    list.sort((a, b) => assessmentDepth(a) - assessmentDepth(b));
  });

  const layer = (base, list) => list.reduce((acc, rec) => ({ ...acc, ...defined(rec) }), base);

  const merged = manifestPages.map((m) => {
    const list = byKey.get(m.page_key);
    if (list && list.length) {
      const richest = list[list.length - 1];
      return {
        ...layer({ ...m }, list),
        // The canonical id must be the one a write should target.
        id: richest.id,
        registered: true,
        duplicated: list.length > 1,
        duplicate_ids: list.length > 1 ? list.map((r) => r.id) : undefined,
      };
    }
    return {
      ...m,
      registered: false,
      lifecycle_status: 'not_started',
      verification_status: 'unverified',
      readiness_score: 0,
      criticality: 'normal',
      open_findings_count: 0,
      p0_findings_count: 0,
    };
  });

  // Records with no matching manifest entry are routes that were removed.
  byKey.forEach((list, key) => {
    if (!manifestPages.some((m) => m.page_key === key)) {
      merged.push({ ...layer({}, list), registered: true, orphaned: true });
    }
  });

  merged.duplicateKeys = duplicateKeys;
  return merged;
}
