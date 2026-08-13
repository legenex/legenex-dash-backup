import React, { useMemo, useState } from 'react';
import {
  Sparkles, Copy, Download, ShieldAlert, Check, X, Pencil, History,
} from 'lucide-react';
import { usePermissions } from '@/lib/AuthContext';
import {
  usePromptDrafts, useChangeRequests, useProgressMutation, parseJson,
} from '@/components/progress/useProgress';
import {
  ProgressPageHeader, Card, CardHeader, CardBody, Badge, EmptyState,
  PrimaryButton, SecondaryButton, LoadingBlock,
} from '@/components/progress/progressUi';

// Prompt Studio: generated implementation briefs, reviewed before they go anywhere.
//
// The single most important property of this surface is that it does not send.
// Approving a prompt marks it approved; a human then copies it, exports it or
// hands it to an agent. There is no dispatch button, and the integration layer
// is deliberately absent rather than stubbed, so nobody can mistake a draft for
// a job that is already running.

const STATUS_TONE = {
  draft: 'neutral',
  needs_context: 'warn',
  ready_for_review: 'info',
  approved: 'good',
  rejected: 'neutral',
  sent: 'info',
  superseded: 'neutral',
};

const TARGET_LABEL = {
  claude_chat_connector: 'Claude chat via the Base44 connector',
  claude_code: 'Claude Code',
  base44_builder: 'Base44 builder',
  codex: 'Codex',
  human_developer: 'Human developer',
};

const humanise = (s) => (s || '').replace(/_/g, ' ').replace(/^\w/, (c) => c.toUpperCase());

export default function PromptStudio() {
  const { can } = usePermissions();
  const promptsQ = usePromptDrafts();
  const changesQ = useChangeRequests();
  const [showSuperseded, setShowSuperseded] = useState(false);

  const prompts = promptsQ.data || [];
  const changes = changesQ.data || [];
  const byId = useMemo(() => new Map(changes.map((c) => [c.id, c])), [changes]);

  const visible = useMemo(() => prompts
    .filter((p) => showSuperseded || p.status !== 'superseded')
    .sort((a, b) => (b.created_date || '').localeCompare(a.created_date || '')),
  [prompts, showSuperseded]);

  if (promptsQ.isLoading) {
    return (
      <>
        <ProgressPageHeader title="Prompt Studio" description="Loading prompt drafts." />
        <LoadingBlock label="Reading prompt drafts" />
      </>
    );
  }

  const superseded = prompts.filter((p) => p.status === 'superseded').length;

  return (
    <>
      <ProgressPageHeader
        title="Prompt Studio"
        description="Implementation briefs assembled from findings, your comments and the real dependency graph. Nothing here is ever sent automatically."
        actions={superseded > 0 ? (
          <SecondaryButton onClick={() => setShowSuperseded(!showSuperseded)}>
            {showSuperseded ? 'Hide' : 'Show'} {superseded} superseded
          </SecondaryButton>
        ) : null}
      />

      {visible.length === 0 ? (
        <Card>
          <EmptyState
            icon={Sparkles}
            title="No prompt drafts yet"
            description="Prompts are generated from a change request, which is raised from a finding, which comes from your comment on a specific metric, pill or component. Start at Application Review."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {visible.map((p) => (
            <PromptCard
              key={p.id}
              prompt={p}
              changeRequest={byId.get(p.change_request_id)}
              canApprove={can('progress_prompts')}
            />
          ))}
        </div>
      )}
    </>
  );
}

function PromptCard({ prompt: p, changeRequest, canApprove }) {
  const mutation = useProgressMutation('PromptDraft', 'progress-prompts');
  const [editing, setEditing] = useState(false);
  const [body, setBody] = useState(p.body || '');
  const [copied, setCopied] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const inputs = parseJson(p.generation_inputs, {});
  const red = inputs.red_surfaces || [];
  const needsAck = red.length > 0 && !p.red_surface_ack;

  const save = () => {
    mutation.mutate({
      action: 'update',
      id: p.id,
      data: { body, human_edited: body !== p.body_original },
    }, { onSuccess: () => setEditing(false) });
  };

  const setStatus = (status) => {
    mutation.mutate({
      action: 'update',
      id: p.id,
      data: {
        status,
        ...(status === 'approved' ? { approved_at: new Date().toISOString() } : {}),
      },
    });
  };

  const ackRed = () => mutation.mutate({ action: 'update', id: p.id, data: { red_surface_ack: true } });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(p.body || '');
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const download = () => {
    const blob = new Blob([p.body || ''], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${p.reference || 'prompt'}.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader
        title={`${p.reference || 'Draft'}  ${changeRequest?.title || ''}`}
        subtitle={`For ${TARGET_LABEL[p.target] || p.target}. Version ${p.version || 1}. Built from ${(inputs.finding_ids || []).length} finding(s) and ${(inputs.thread_ids || []).length} comment(s).`}
        icon={Sparkles}
        actions={(
          <div className="flex flex-wrap items-center gap-1.5">
            {p.human_edited && <Badge tone="info">Edited</Badge>}
            {red.length > 0 && <Badge tone="bad">RED</Badge>}
            <Badge tone={STATUS_TONE[p.status] || 'neutral'}>{humanise(p.status)}</Badge>
          </div>
        )}
      />
      <CardBody className="space-y-3">
        {red.length > 0 && (
          <div className="rounded-md border border-border bg-secondary px-3 py-2">
            <p className="flex items-center gap-1.5 text-[12px] font-medium text-primary">
              <ShieldAlert className="h-3.5 w-3.5" />
              This work touches RED surfaces
            </p>
            <p className="mt-1 text-[12px] text-foreground">
              {red.map((r) => r.label || r.key).join('; ')}
            </p>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Detected in code, not by the model. This prompt cannot be approved until you acknowledge that these surfaces are in scope and that you have given explicit approval.
            </p>
            {!p.red_surface_ack && canApprove && (
              <div className="mt-2">
                <SecondaryButton onClick={ackRed}>I have approved these RED surfaces</SecondaryButton>
              </div>
            )}
            {p.red_surface_ack && (
              <p className="mt-1.5 flex items-center gap-1.5 text-[11px] text-chart-5">
                <Check className="h-3 w-3" /> Acknowledged
              </p>
            )}
          </div>
        )}

        {editing ? (
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            rows={24}
            className="w-full resize-y rounded-md border border-border bg-background px-3 py-2 font-mono text-[11px] leading-relaxed text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
          />
        ) : (
          <div className={`overflow-hidden rounded-md border border-border bg-background ${expanded ? '' : 'max-h-80'}`}>
            <pre className="overflow-x-auto whitespace-pre-wrap px-3 py-2.5 font-mono text-[11px] leading-relaxed text-foreground">
              {p.body}
            </pre>
          </div>
        )}

        {!editing && (p.body || '').length > 1200 && (
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            className="text-[11px] text-primary hover:opacity-80"
          >
            {expanded ? 'Collapse' : 'Show the whole prompt'}
          </button>
        )}

        <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {editing ? (
            <>
              <PrimaryButton onClick={save} disabled={mutation.isPending}>
                {mutation.isPending ? 'Saving' : 'Save edit'}
              </PrimaryButton>
              <SecondaryButton onClick={() => { setBody(p.body || ''); setEditing(false); }}>Cancel</SecondaryButton>
            </>
          ) : (
            <>
              <SecondaryButton onClick={copy}>
                <span className="flex items-center gap-1.5">
                  {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
                  {copied ? 'Copied' : 'Copy prompt'}
                </span>
              </SecondaryButton>
              <SecondaryButton onClick={download}>
                <span className="flex items-center gap-1.5">
                  <Download className="h-3.5 w-3.5" />
                  Export Markdown
                </span>
              </SecondaryButton>
              {canApprove && (
                <>
                  <SecondaryButton onClick={() => setEditing(true)}>
                    <span className="flex items-center gap-1.5"><Pencil className="h-3.5 w-3.5" />Edit</span>
                  </SecondaryButton>
                  {p.status !== 'approved' && (
                    <PrimaryButton onClick={() => setStatus('approved')} disabled={needsAck}>
                      <span className="flex items-center gap-1.5"><Check className="h-3.5 w-3.5" />Approve</span>
                    </PrimaryButton>
                  )}
                  {p.status !== 'rejected' && (
                    <SecondaryButton onClick={() => setStatus('rejected')}>
                      <span className="flex items-center gap-1.5"><X className="h-3.5 w-3.5" />Reject</span>
                    </SecondaryButton>
                  )}
                  {p.status === 'approved' && (
                    <SecondaryButton onClick={() => setStatus('sent')}>Mark as handed off</SecondaryButton>
                  )}
                </>
              )}
            </>
          )}
        </div>

        {needsAck && (
          <p className="text-[11px] text-chart-3">
            Approval is blocked until the RED surfaces above are acknowledged.
          </p>
        )}

        {p.human_edited && (
          <details className="border-t border-border pt-3">
            <summary className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted-foreground">
              <History className="h-3 w-3" />
              Show what the generator originally produced
            </summary>
            <pre className="mt-2 max-h-64 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-background px-3 py-2 font-mono text-[10px] leading-relaxed text-muted-foreground">
              {p.body_original}
            </pre>
          </details>
        )}

        <p className="text-[11px] text-muted-foreground">
          Nothing on this page is dispatched automatically. Approving records a decision; handing the prompt to an agent is a separate action you take yourself.
        </p>
      </CardBody>
    </Card>
  );
}
