import React from 'react';
import { DocPage, Section, Placeholder } from '@/components/docs/DocsUI';

export default function Guides() {
  return (
    <DocPage
      title="Guides"
      subtitle="Non-API walkthroughs for getting the most out of the Legenex dashboard."
    >
      <Section title="Connect Meta">
        <p className="text-[14px]">
          Link your Meta ad account to pull spend into Legenex and fire Conversions API events on sold and qualified
          leads.
        </p>
        <Placeholder>Step-by-step Meta connection guide, coming soon.</Placeholder>
      </Section>

      <Section title="Map campaigns">
        <p className="text-[14px]">
          Assign suppliers and buyers to campaigns and verticals so leads route to the right deliveries.
        </p>
        <Placeholder>Campaign mapping guide, coming soon.</Placeholder>
      </Section>

      <Section title="Read the dashboards">
        <p className="text-[14px]">
          Understand the Overview, Distribution, and Reports screens: acceptance rates, sold %, revenue, and CPL.
        </p>
        <Placeholder>Dashboard reading guide, coming soon.</Placeholder>
      </Section>
    </DocPage>
  );
}