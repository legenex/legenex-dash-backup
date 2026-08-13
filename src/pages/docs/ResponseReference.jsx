import React from 'react';
import { DocPage, Section, CodeBlock, FieldTable, InlineCode, Callout } from '@/components/docs/DocsUI';

const envCols = [
  { key: 'field', label: 'Field', className: 'w-44' },
  { key: 'type', label: 'Type', className: 'w-28' },
  { key: 'desc', label: 'Description' },
];

const ENVELOPE = [
  { field: <InlineCode>ok</InlineCode>, type: 'boolean', desc: 'true when the lead was accepted, queued, or de-duplicated; false for rejections and errors.' },
  { field: <InlineCode>trace_id</InlineCode>, type: 'string', desc: 'Unique id for this request. Include it in support tickets to trace the lead.' },
  { field: <InlineCode>received_at</InlineCode>, type: 'string', desc: 'ISO-8601 timestamp when the request was received.' },
  { field: <InlineCode>acceptance</InlineCode>, type: 'enum', desc: 'accepted | queued | duplicate | rejected | error | unauthorized.' },
  { field: <InlineCode>lead_id</InlineCode>, type: 'string | null', desc: 'System-assigned unique lead id. Null when the request failed before a lead was created (e.g. bad key).' },
  { field: <InlineCode>lead_status</InlineCode>, type: 'enum', desc: 'qualified | queued | sold | unsold | disqualified | rejected | returned | duplicate | error.' },
  { field: <InlineCode>sold</InlineCode>, type: 'boolean', desc: 'true only when the lead sold to at least one buyer.' },
  { field: <InlineCode>revenue</InlineCode>, type: 'number | null', desc: 'Revenue for a sold lead. Null unless the lead sold and your key is permitted to see revenue.' },
  { field: <InlineCode>currency</InlineCode>, type: 'string', desc: 'ISO currency for revenue. Always USD.' },
  { field: <InlineCode>code</InlineCode>, type: 'string', desc: 'Machine-readable outcome code, e.g. SOLD, UNSOLD, DUPLICATE, MISSING_FIELDS, BAD_KEY, LB_ERROR, INTERNAL_ERROR.' },
  { field: <InlineCode>reason</InlineCode>, type: 'string | null', desc: 'Human-readable explanation when there is one (rejection text, queue reason). Null on clean success.' },
  { field: <InlineCode>message</InlineCode>, type: 'string', desc: 'Short summary message for display.' },
  { field: <InlineCode>Response</InlineCode>, type: 'string', desc: 'Legacy mirror (Success/Sold/Unsold/Queued/Duplicate/Error) for backward compatibility. Prefer acceptance + lead_status.' },
];

export default function ResponseReference() {
  return (
    <DocPage
      title="Response Reference"
      subtitle="Every response is the same layered envelope. Key your automation off acceptance and lead_status: the legacy Response field is preserved as a mirror."
    >
      <Section title="The envelope">
        <FieldTable columns={envCols} rows={ENVELOPE} />
        <Callout>
          On sold leads where your key exposes revenue, an additional <InlineCode>revenue_exposed</InlineCode> string
          (fixed to 2 decimals) is included alongside <InlineCode>revenue</InlineCode>.
        </Callout>
      </Section>

      <Section title="acceptance vs lead_status">
        <p>
          <InlineCode>acceptance</InlineCode> answers "did we take the lead?" and <InlineCode>lead_status</InlineCode> answers
          "what happened to it?". A lead can be <InlineCode>accepted</InlineCode> yet <InlineCode>unsold</InlineCode>; a lead
          can be <InlineCode>queued</InlineCode> for manual review; an <InlineCode>error</InlineCode> means the pipeline
          failed downstream.
        </p>
      </Section>

      <Section title="Example: accepted & sold">
        <CodeBlock
          code={`{
  "ok": true,
  "trace_id": "3f8c9d21-...",
  "received_at": "2026-07-05T10:14:22.001Z",
  "acceptance": "accepted",
  "lead_id": "84213",
  "lead_status": "sold",
  "sold": true,
  "revenue": 42.5,
  "currency": "USD",
  "code": "SOLD",
  "reason": null,
  "message": "Sold",
  "Response": "Sold"
}`}
        />
      </Section>

      <Section title="Example: accepted & unsold">
        <CodeBlock
          code={`{
  "ok": true,
  "acceptance": "accepted",
  "lead_id": "84214",
  "lead_status": "unsold",
  "sold": false,
  "revenue": null,
  "currency": "USD",
  "code": "UNSOLD",
  "reason": "No matching buyer",
  "message": "No matching buyer",
  "Response": "Unsold"
}`}
        />
      </Section>

      <Section title="Example: queued">
        <p>Held for manual handling, for example a missing TrustedForm cert or a required field.</p>
        <CodeBlock
          code={`{
  "ok": true,
  "acceptance": "queued",
  "lead_id": "84215",
  "lead_status": "queued",
  "sold": false,
  "revenue": null,
  "currency": "USD",
  "code": "MISSING_FIELDS",
  "reason": "Missing required fields: accident_state",
  "message": "Missing required fields: accident_state",
  "Response": "Queued"
}`}
        />
      </Section>

      <Section title="Example: duplicate">
        <CodeBlock
          code={`{
  "ok": true,
  "acceptance": "duplicate",
  "lead_id": "84216",
  "lead_status": "duplicate",
  "sold": false,
  "revenue": null,
  "currency": "USD",
  "code": "DUPLICATE",
  "reason": "Duplicate: matched on phone within 30 days",
  "message": "Duplicate: matched on phone within 30 days",
  "Response": "Duplicate"
}`}
        />
      </Section>

      <Section title="Example: error">
        <p>The lead was created but the pipeline failed (e.g. no connector, downstream error).</p>
        <CodeBlock
          code={`{
  "ok": false,
  "acceptance": "error",
  "lead_id": "84217",
  "lead_status": "error",
  "sold": false,
  "revenue": null,
  "currency": "USD",
  "code": "LB_ERROR",
  "reason": "No active LeadByte connector configured",
  "message": "No active LeadByte connector configured",
  "Response": "Error"
}`}
        />
      </Section>

      <Section title="Example: bad key">
        <p>Returned with HTTP <InlineCode>401</InlineCode>. No lead is created, so <InlineCode>lead_id</InlineCode> is null.</p>
        <CodeBlock
          code={`{
  "ok": false,
  "acceptance": "unauthorized",
  "lead_id": null,
  "lead_status": "rejected",
  "sold": false,
  "revenue": null,
  "currency": "USD",
  "code": "BAD_KEY",
  "reason": "Invalid or missing API key",
  "message": "Invalid or missing API key",
  "Response": "Error"
}`}
        />
      </Section>
    </DocPage>
  );
}