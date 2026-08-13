import React from 'react';
import { Outlet } from 'react-router-dom';
import DistributionNav from './DistributionNav';
import SectionShell from '@/components/layout/SectionShell';

// Layout route: full-width header above a [ Distribution sub-menu | content ] row.
export default function DistributionLayout() {
  return (
    <SectionShell nav={<DistributionNav />}>
      <Outlet />
    </SectionShell>
  );
}