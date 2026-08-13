import React from 'react';
import { DocPage, Section, Placeholder, Callout, InlineCode } from '@/components/docs/DocsUI';

export default function ReportingApi() {
  return (
    <DocPage
      title="Reporting API"
      subtitle="Programmatic access to lead, delivery, and performance data scoped to your account."
    >
      <Section title="Overview">
        <p>
          Read endpoints return leads and their outcomes filtered to the supplier that owns the key. A key must carry the{' '}
          <InlineCode>read</InlineCode> scope to call reporting endpoints.
        </p>
        <Callout>
          Today, reporting is available through the Legenex dashboard and the supplier / buyer portals. A public reporting
          API is on the roadmap, the endpoint contract below is a placeholder.
        </Callout>
      </Section>

      <Section title="Endpoints">
        <Placeholder>List leads, delivery logs, and daily performance summaries, coming soon.</Placeholder>
      </Section>
    </DocPage>
  );
}