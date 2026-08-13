import React from 'react';
import { Outlet } from 'react-router-dom';
import OperationsNav from './OperationsNav';
import SectionShell from '@/components/layout/SectionShell';

// Layout route: full-width header above a [ Operations sub-menu | content ] row.
export default function OperationsLayout() {
  return (
    <SectionShell nav={<OperationsNav />}>
      <Outlet />
    </SectionShell>
  );
}