import React from 'react';
import { DocPage, Section, CodeBlock, FieldTable, InlineCode, Callout } from '@/components/docs/DocsUI';

export default function Authentication() {
  return (
    <DocPage
      title="Authentication"
      subtitle="Every request is authenticated with a supplier API key passed in the X-API-KEY request header."
    >
      <Section title="The X-API-KEY header">
        <p>Pass your key on every request. There is no OAuth flow for lead posting, the key alone identifies the supplier.</p>
        <CodeBlock language="bash" code={`X-API-KEY: lgnx_int_xxxxxxxxxxxx`} />
        <Callout tone="warn">
          Keys are secret. Never expose a key in client-side code or a public repository. Rotate immediately if leaked.
        </Callout>
      </Section>

      <Section title="One key per supplier">
        <p>
          Each supplier (source) is issued its own key. The key both authenticates the request and attributes the
          lead to that supplier, so you never send a supplier identifier separately, it is derived from the key. Keys
          are prefixed by type, for example <InlineCode>lgnx_int_</InlineCode> for an internal ingest key.
        </p>
      </Section>

      <Section title="Key scopes">
        <p>Keys carry a scope that limits which operations they may perform:</p>
        <FieldTable
          columns={[
            { key: 'scope', label: 'Scope', className: 'w-32' },
            { key: 'desc', label: 'Grants' },
          ]}
          rows={[
            { scope: <InlineCode>ingest</InlineCode>, desc: 'Post leads to the ingestion endpoint. This is the default for supplier keys.' },
            { scope: <InlineCode>read</InlineCode>, desc: 'Read leads, feedback, and reporting data scoped to the supplier.' },
            { scope: <InlineCode>admin</InlineCode>, desc: 'Full read/write across the supplier account, including returns and configuration.' },
          ]}
        />
      </Section>

      <Section title="Authentication failures">
        <p>
          A missing, malformed, or revoked key returns an <InlineCode>unauthorized</InlineCode> acceptance with an HTTP{' '}
          <InlineCode>401</InlineCode>:
        </p>
        <CodeBlock
          code={`{
  "ok": false,
  "acceptance": "unauthorized",
  "code": "BAD_KEY",
  "reason": "invalid_api_key",
  "message": "API key is missing or invalid.",
  "Response": "Error"
}`}
        />
      </Section>
    </DocPage>
  );
}