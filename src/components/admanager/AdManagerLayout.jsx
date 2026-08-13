import React from 'react';
import { Outlet } from 'react-router-dom';
import AdManagerNav from './AdManagerNav';
import SectionShell from '@/components/layout/SectionShell';

// Layout route: full-width header above a [ Ad Manager sub-menu | content ] row.
// Mirrors OperationsLayout so the section behaves identically to the rest of
// the dashboard, including the resizable sub-nav.
export default function AdManagerLayout() {
  return (
    <SectionShell nav={<AdManagerNav />}>
      <Outlet />
    </SectionShell>
  );
}
