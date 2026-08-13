import React from 'react';
import { Outlet } from 'react-router-dom';
import CallsNav from './CallsNav';
import SectionShell from '@/components/layout/SectionShell';

// Layout route: full-width header above a [ Calls sub-menu | page content ]
// row. Mirrors LeadsLayout exactly so the two sections sit identically.
export default function CallsLayout() {
  return (
    <SectionShell nav={<CallsNav />}>
      <Outlet />
    </SectionShell>
  );
}
