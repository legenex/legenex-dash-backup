import React from 'react';
import { DocPage, Section, FieldTable, InlineCode, Callout } from '@/components/docs/DocsUI';

export default function ErrorsRateLimits() {
  return (
    <DocPage
      title="Errors & Rate Limits"
      subtitle="How the API signals failures and what limits apply to lead submission."
    >
      <Section title="HTTP status codes">
        <FieldTable
          columns={[
            { key: 'code', label: 'Status', className: 'w-28' },
            { key: 'meaning', label: 'Meaning' },
          ]}
          rows={[
            { code: <InlineCode>200</InlineCode>, meaning: 'Request processed. Read acceptance / lead_status in the envelope for the outcome (including business rejections).' },
            { code: <InlineCode>401</InlineCode>, meaning: 'Missing or invalid API key (acceptance: unauthorized).' },
            { code: <InlineCode>405</InlineCode>, meaning: 'Method not allowed, use POST for lead submission.' },
          ]}
        />
        <Callout tone="warn">
          Most business outcomes (unsold, queued, duplicate, downstream error) return HTTP 200 with a descriptive
          envelope, do not treat a 200 as "sold". Always inspect <InlineCode>acceptance</InlineCode> and{' '}
          <InlineCode>lead_status</InlineCode>.
        </Callout>
      </Section>

      <Section title="Error codes">
        <FieldTable
          columns={[
            { key: 'code', label: 'code', className: 'w-48' },
            { key: 'meaning', label: 'Meaning' },
          ]}
          rows={[
            { code: <InlineCode>BAD_KEY</InlineCode>, meaning: 'API key missing or invalid.' },
            { code: <InlineCode>MISSING_CERT</InlineCode>, meaning: 'TrustedForm cert missing or invalid, lead queued.' },
            { code: <InlineCode>MISSING_FIELDS</InlineCode>, meaning: 'One or more required fields absent, lead queued.' },
            { code: <InlineCode>DUPLICATE</InlineCode>, meaning: 'Lead matched an existing record.' },
            { code: <InlineCode>LB_ERROR</InlineCode>, meaning: 'Downstream delivery/processing error.' },
            { code: <InlineCode>INTERNAL_ERROR</InlineCode>, meaning: 'Unexpected server error, retry is safe (idempotency by dedupe).' },
          ]}
        />
      </Section>

      <Section title="Rate limits">
        <p>
          Standard supplier keys are provisioned for sustained real-time posting. There is no hard per-second cap for
          normal traffic; abusive bursts may be throttled. If you expect a very high volume, tell your account manager so
          we can size your throughput.
        </p>
      </Section>
    </DocPage>
  );
}