import React from 'react';
import { Outlet } from 'react-router-dom';
import ToolsNav from './ToolsNav';
import SectionShell from '@/components/layout/SectionShell';

// Layout route: full-width header above a [ Tools sub-menu | page content ] row.
export default function ToolsLayout() {
  return (
    <SectionShell nav={<ToolsNav />}>
      <Outlet />
    </SectionShell>
  );
}