import React from 'react';
import { Outlet } from 'react-router-dom';
import LeadsNav from './LeadsNav';
import SectionShell from '@/components/layout/SectionShell';

// Layout route: full-width header above a [ Leads sub-menu | page content ] row.
export default function LeadsLayout() {
  return (
    <SectionShell nav={<LeadsNav />}>
      <Outlet />
    </SectionShell>
  );
}