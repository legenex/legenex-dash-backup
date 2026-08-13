import React from 'react';
import PageHeader from '@/components/shared/PageHeader';
import { SectionHeaderSlot } from '@/components/layout/SectionShell';

// Drop-in replacement for PageHeader used by pages inside a SectionShell.
// Renders the same header markup, but portals it into the shell's full-width
// header region above the [ side menu | content ] row.
export default function SectionHeader({ title, subtitle, children }) {
  return (
    <SectionHeaderSlot>
      <PageHeader title={title} subtitle={subtitle}>{children}</PageHeader>
    </SectionHeaderSlot>
  );
}