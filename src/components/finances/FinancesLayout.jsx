import React from 'react';
import { Outlet } from 'react-router-dom';
import FinancesNav from './FinancesNav';
import SectionShell from '@/components/layout/SectionShell';

// Layout route: full-width header above a [ Finances sub-menu | content ] row.
export default function FinancesLayout() {
  return (
    <SectionShell nav={<FinancesNav />}>
      <Outlet />
    </SectionShell>
  );
}