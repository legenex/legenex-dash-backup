import React from 'react';
import { DocPage, Section, CodeBlock, FieldTable, InlineCode, Callout, Placeholder } from '@/components/docs/DocsUI';

export default function Postbacks() {
  return (
    <DocPage
      title="Postbacks & Webhooks"
      subtitle="Receive server-to-server notifications when a lead changes state, so you can fire conversions or update your own systems."
    >
      <Section title="Outbound webhooks">
        <p>
          Configure webhook URLs in the dashboard. When a lead reaches a final status, Legenex POSTs a JSON body to each
          subscribed URL for the matching event.
        </p>
        <FieldTable
          columns={[
            { key: 'event', label: 'Event', className: 'w-52' },
            { key: 'when', label: 'Fires when' },
          ]}
          rows={[
            { event: <InlineCode>lead.sold</InlineCode>, when: 'The lead sold to at least one buyer.' },
            { event: <InlineCode>lead.unsold</InlineCode>, when: 'The lead was accepted but did not sell.' },
            { event: <InlineCode>lead.queued</InlineCode>, when: 'The lead was queued for manual handling.' },
            { event: <InlineCode>lead.duplicate</InlineCode>, when: 'The lead was detected as a duplicate.' },
            { event: <InlineCode>lead.error</InlineCode>, when: 'Processing failed for the lead.' },
          ]}
        />
        <CodeBlock
          code={`{
  "event": "lead.sold",
  "lead_id": "84213",
  "status": "Sold",
  "supplier": "LEADFLOW"
}`}
        />
        <Callout>
          Custom headers you configure on the webhook are sent with each request, use them for your own signature or bearer token.
        </Callout>
      </Section>

      <Section title="Conversion postbacks (S1)">
        <p>
          The <InlineCode>s1</InlineCode> click id you pass on ingestion is carried through so you can attribute
          downstream sold / conversion events back to the original click.
        </p>
        <Placeholder>Configurable outbound conversion postback URLs, reference coming soon.</Placeholder>
      </Section>
    </DocPage>
  );
}