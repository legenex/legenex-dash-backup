import React from 'react';
import { useOutletContext } from 'react-router-dom';

function Row({ label, value }) {
  return (
    <div className="flex items-center justify-between py-2.5 border-b border-border last:border-0">
      <span className="text-[12px] text-muted-foreground">{label}</span>
      <span className="text-[13px] text-foreground">{value || '-'}</span>
    </div>
  );
}

export default function SupplierPortalSettings() {
  const { supplier } = useOutletContext();

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-[22px] font-bold text-foreground tracking-tight">Settings</h1>
        <p className="text-[13px] text-muted-foreground mt-1">Your contact profile with us.</p>
      </div>

      <div className="bg-card border border-border rounded-[10px] p-5 max-w-2xl">
        <div className="text-[12px] font-semibold text-muted-foreground uppercase tracking-wider mb-3">Source Profile</div>
        <Row label="Name" value={supplier?.name} />
        <Row label="SID" value={supplier?.sid} />
        <Row label="Email" value={supplier?.email} />
        <Row label="Phone" value={supplier?.phone} />
        <Row label="Vertical" value={supplier?.vertical} />
        <Row label="Brand" value={supplier?.brand} />
        <Row label="Landing Page" value={supplier?.landing_page_url} />
      </div>
    </div>
  );
}