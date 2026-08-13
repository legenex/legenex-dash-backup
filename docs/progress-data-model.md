# Progress Control Center data model

Status: **Implemented**. Eight new entities plus an additive extension to `AuditFinding`.

## Reused, not duplicated

`AuditFinding`, `AuditRun` and `BenchmarkCriterion` already existed for the audit harness. Rather than creating a parallel findings table, `AuditFinding` was extended additively so machine checks, AI reviews and human comments share one list. Nothing was renamed or removed.

Fields added to `AuditFinding`: `page_key`, `origin`, `title`, `description`, `finding_type`, `priority`, `confidence`, `evidence_type`, `requires_verification`, `suggested_fix`, `acceptance_criteria`, `open_question`, `assignee`, `reporter`, `thread_id`, `change_request_id`, `verification_evidence`, `resolved_at`. The `source` enum gained `ai_review` and `human_comment`.

## New entities

| Entity | Purpose | Key rule it enforces |
|---|---|---|
| `ProgressPage` | Normalised inventory of every route, tab and portal page | Generated fields are machine owned; human fields are never overwritten by a sync |
| `ReviewThread` | Anchored comments on a page, metric, pill, component, entity or function | Captures context automatically so a comment survives without the conversation |
| `ChangeRequest` | The unit of work between a finding and a shipped fix | Carries `touches_red_surface`, set by a deterministic code check |
| `PromptDraft` | Generated implementation briefs | `status` never reaches sent without a human action; prior versions become superseded, not deleted |
| `ReleaseGate` | Objective conditions before cutover | A waived blocking gate is a waiver, never a pass |
| `MigrationRequirement` | LeadByte capability parity | Verified on inference alone is downgraded in the calculation |
| `VerificationRecord` | Evidence that a check actually passed | `needs_env` never counts as a pass; superseded records stop counting |
| `ProgressSnapshot` | One row per day for trend charts | Upserted by day key so re-running is idempotent |

## Row level security

Every new entity carries admin-only RLS on create, read, update and delete, matching the `Lead` pattern. Buyer and supplier accounts are additionally blocked from all five progress permission keys in code, through `RESTRICTED_FOR_PARTNERS`, regardless of which boxes are ticked in Users and Roles.

## Generated artefacts, not hand maintained

| File | Written by | Consumed by |
|---|---|---|
| `docs/progress/page-inventory.json` | `scripts/generate-page-inventory.mjs` | Humans, and the `--check` gate |
| `docs/progress/page-metadata.json` | The same script, additively only | Humans. The generator never overwrites a value here |
| `src/lib/progress/pageManifest.json` | The same script, slim copy | The Application Review tree, before any sync |
| `base44/functions/progressSync/pageManifest.js` | The same script, full copy | `progressSync` |
| `base44/functions/progress*/readiness.js` | `scripts/generate-progress-bundle.mjs` | The backend functions, parity checked |
