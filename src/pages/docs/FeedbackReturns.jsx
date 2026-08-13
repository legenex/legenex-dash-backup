import React from 'react';
import { DocPage, Section, CodeBlock, Endpoint, FieldTable, InlineCode, Callout, Placeholder } from '@/components/docs/DocsUI';

export default function FeedbackReturns() {
  return (
    <DocPage
      title="Feedback & Returns"
      subtitle="Report the downstream outcome of a lead (conversion, wrong number, etc.) and request returns for leads that did not meet spec."
    >
      <Section title="Post buyer feedback">
        <p>Send an outcome for a previously delivered lead. Legenex matches it to the original lead by phone or email.</p>
        <Endpoint method="POST" path="/functions/buyerFeedbackWebhook" />
        <CodeBlock
          code={`{
  "email": "nick@example.com",
  "mobile": "+15125550123",
  "disposition": "Converted",
  "outcome": "Retained client",
  "revenue_value": 1200,
  "notes": "Signed engagement letter"
}`}
        />
        <FieldTable
          columns={[
            { key: 'field', label: 'Field', className: 'w-44' },
            { key: 'desc', label: 'Description' },
          ]}
          rows={[
            { field: <InlineCode>disposition</InlineCode>, desc: 'Your outcome label. Mapped to the Legenex disposition taxonomy automatically.' },
            { field: <InlineCode>email / mobile</InlineCode>, desc: 'Used to match the feedback back to the original lead.' },
            { field: <InlineCode>revenue_value</InlineCode>, desc: 'Optional revenue you attribute to the lead.' },
            { field: <InlineCode>notes / outcome</InlineCode>, desc: 'Optional free-text context shown in reporting.' },
          ]}
        />
        <Callout>
          Feedback with no matching lead is stored unmatched and can be reconciled later in the portal.
        </Callout>
      </Section>

      <Section title="Request a return">
        <p>Returns are submitted from the buyer portal or via the portal action endpoint. A return moves through <InlineCode>requested → approved / rejected</InlineCode>.</p>
        <Placeholder>Programmatic returns API, endpoint reference coming soon.</Placeholder>
      </Section>
    </DocPage>
  );
}