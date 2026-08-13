import React from 'react';
import { DocPage, Section, InlineCode, Callout } from '@/components/docs/DocsUI';

export default function Versioning() {
  return (
    <DocPage
      title="Versioning & Changelog"
      subtitle="How the API evolves and what has changed."
    >
      <Section title="Versioning">
        <p>
          The ingestion endpoint is available at both <InlineCode>/functions/leads</InlineCode> and the versioned
          alias <InlineCode>/v1/leads</InlineCode>. Backward-compatible additions (new envelope fields, new optional
          request fields) ship without a version bump. Breaking changes will be released under a new version prefix.
        </p>
        <Callout>
          The legacy <InlineCode>Response</InlineCode> field is retained indefinitely as a mirror so older integrations
          keep working while you migrate to <InlineCode>acceptance</InlineCode> + <InlineCode>lead_status</InlineCode>.
        </Callout>
      </Section>

      <Section title="Changelog">
        <div className="space-y-4">
          <div className="border-l-2 border-primary/40 pl-4">
            <div className="text-foreground font-medium text-[14px]">v1.0, Layered response envelope</div>
            <p className="text-[13px]">
              Introduced the structured envelope (<InlineCode>ok</InlineCode>, <InlineCode>trace_id</InlineCode>,{' '}
              <InlineCode>acceptance</InlineCode>, <InlineCode>lead_status</InlineCode>, revenue, code, reason) across
              every outcome, with the legacy <InlineCode>Response</InlineCode> mirror preserved.
            </p>
          </div>
          <div className="border-l-2 border-border pl-4">
            <div className="text-foreground font-medium text-[14px]">v1.0, Supplier Posting Specs</div>
            <p className="text-[13px]">Self-service integration guide and public spec endpoint per supplier.</p>
          </div>
        </div>
      </Section>
    </DocPage>
  );
}