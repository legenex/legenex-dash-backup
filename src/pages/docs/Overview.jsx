import React from 'react';
import { DocPage, Section, CodeBlock, FieldTable, InlineCode, Endpoint, Callout } from '@/components/docs/DocsUI';

export default function Overview() {
  return (
    <DocPage
      title="Overview & Quickstart"
      subtitle="The Legenex API lets you post leads into the platform, receive real-time acceptance decisions, and read back delivery, feedback, and reporting data."
    >
      <Section title="How posting works">
        <p>
          You send a lead as a JSON payload to a single ingestion endpoint. Legenex authenticates the request,
          validates and normalises the fields, runs enrichment (phone / email verification), routes the lead to the
          right buyer or delivery bucket, and returns a structured decision envelope describing the outcome.
        </p>
        <p>
          Every response follows the same <InlineCode>layered envelope</InlineCode> so you can key your own automation
          off a small, stable set of fields regardless of outcome. See the{' '}
          <a href="/docs/response-reference" className="text-primary hover:underline">Response Reference</a> for the full schema.
        </p>
      </Section>

      <Section title="Base URL & environments">
        <FieldTable
          columns={[
            { key: 'env', label: 'Environment' },
            { key: 'url', label: 'Base URL' },
          ]}
          rows={[
            { env: 'Production', url: <InlineCode>https://api.legenex.com</InlineCode> },
            { env: 'Docs', url: <InlineCode>https://docs.legenex.com</InlineCode> },
          ]}
        />
        <Callout>
          All endpoints are served over HTTPS only. Requests over plain HTTP are rejected.
        </Callout>
      </Section>

      <Section title="Quickstart: post your first lead">
        <p>Send a single lead with your supplier API key in the <InlineCode>X-API-KEY</InlineCode> header:</p>
        <Endpoint method="POST" path="https://api.legenex.com/functions/leads" />
        <CodeBlock
          language="bash"
          code={`curl -X POST https://api.legenex.com/functions/leads \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: lgnx_int_xxxxxxxxxxxx" \\
  -d '{
    "first_name": "Nick",
    "last_name": "Allen",
    "email": "nick@example.com",
    "mobile": "+15125550123",
    "zip": "78701",
    "accident_state": "TX",
    "trustedform_url": "https://cert.trustedform.com/abc123",
    "sid": "LEADFLOW",
    "s1": "clickid_9f2a"
  }'`}
        />
        <p>A successful, sold lead returns:</p>
        <CodeBlock
          code={`{
  "ok": true,
  "trace_id": "trc_7c1f9a",
  "acceptance": "accepted",
  "lead_id": 84213,
  "lead_status": "sold",
  "sold": true,
  "revenue": 42.5,
  "currency": "USD",
  "code": "SOLD",
  "message": "Lead accepted and sold.",
  "Response": "Success"
}`}
        />
      </Section>

      <Section title="Next steps">
        <p>
          Head to <a href="/docs/authentication" className="text-primary hover:underline">Authentication</a> to manage
          keys, <a href="/docs/post-a-lead" className="text-primary hover:underline">Post a Lead</a> for the full request
          contract, and the <a href="/docs/field-dictionary" className="text-primary hover:underline">Field Dictionary</a> for
          every accepted field.
        </p>
      </Section>
    </DocPage>
  );
}