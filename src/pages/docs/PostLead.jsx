import React from 'react';
import { DocPage, Section, CodeBlock, FieldTable, InlineCode, Endpoint, Callout } from '@/components/docs/DocsUI';

export default function PostLead() {
  return (
    <DocPage
      title="Post a Lead"
      subtitle="Submit a single lead as a JSON body. The endpoint authenticates, validates, enriches, routes, and returns a decision envelope synchronously."
    >
      <Section title="Endpoint">
        <Endpoint method="POST" path="/functions/leads" />
        <p>Alias:</p>
        <Endpoint method="POST" path="/v1/leads" />
      </Section>

      <Section title="Headers">
        <FieldTable
          columns={[
            { key: 'header', label: 'Header', className: 'w-56' },
            { key: 'value', label: 'Value' },
          ]}
          rows={[
            { header: <InlineCode>X-API-KEY</InlineCode>, value: 'Your supplier ingest key. Required.' },
            { header: <InlineCode>Content-Type</InlineCode>, value: <><InlineCode>application/json</InlineCode>, the body is a flat JSON object.</> },
          ]}
        />
        <Callout>
          The API key also accepts the aliases <InlineCode>X_KEY</InlineCode> and HTTP Basic (key as username). The supplier is
          derived from the key, you never send a supplier id.
        </Callout>
      </Section>

      <Section title="Example request">
        <p>A full, realistic body using the accepted fields:</p>
        <CodeBlock
          code={`{
  "first_name": "Nick",
  "last_name": "Allen",
  "email": "nick@example.com",
  "mobile": "+15125550123",
  "zip": "78701",
  "ip_address": "203.0.113.24",
  "accident_state": "TX",
  "accident_type": "auto",
  "accident_details": "Rear-ended at a stop light",
  "fault": "no",
  "injured": "yes",
  "treatment": "yes",
  "attorney": "no",
  "optin_url": "https://checkacase.com/lp/mva",
  "trustedform_url": "https://cert.trustedform.com/abc123def4567890abc123def4567890abc123de",
  "jornaya_token": "A1B2C3D4-E5F6-7890-ABCD-EF1234567890",
  "utm_source": "facebook",
  "sid": "LEADFLOW",
  "s1": "clickid_9f2a"
}`}
        />
      </Section>

      <Section title="cURL">
        <CodeBlock
          language="bash"
          code={`curl -X POST https://api.legenex.com/functions/leads \\
  -H "Content-Type: application/json" \\
  -H "X-API-KEY: lgnx_int_xxxxxxxxxxxx" \\
  --data @lead.json`}
        />
      </Section>

      <Section title="A note on ping-post">
        <p>
          Campaigns can be configured for either <InlineCode>direct_post</InlineCode> or <InlineCode>ping_post</InlineCode>.
          In direct-post the single call above both submits and sells the lead. In ping-post you first "ping" to obtain a
          bid/eligibility decision and then "post" to confirm the sale. Ping-post is enabled per campaign, contact your
          account manager to turn it on, and see the <a href="/docs/response-reference" className="text-primary hover:underline">Response Reference</a> for
          how bids are surfaced in the envelope.
        </p>
      </Section>

      <Section title="Field reference">
        <p>
          Every accepted field, with required vs optional and system-populated fields, is listed in the{' '}
          <a href="/docs/field-dictionary" className="text-primary hover:underline">Field Dictionary</a>.
        </p>
      </Section>
    </DocPage>
  );
}