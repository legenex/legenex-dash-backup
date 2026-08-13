import React from 'react';
import { ApplyField, PhoneField, ApplyCheckbox } from '../ApplyField';
import StateMultiSelect from '../StateMultiSelect';

// Section 1: Client Information. Company, target states, primary contact, and
// the checkbox that reveals the secondary contact section.
export default function CompanyStep({ form, set, errors, locked }) {
  return (
    <div className="space-y-5">
      <ApplyField
        label="Company Name"
        value={form.company_name}
        onChange={(v) => set('company_name', v)}
        error={errors.company_name}
        placeholder="Company Name"
        required
        disabled={locked}
      />
      <ApplyField
        label="Company Website"
        value={form.company_website}
        onChange={(v) => set('company_website', v)}
        error={errors.company_website}
        placeholder="Company Website URL"
      />

      <div>
        <div className="mb-2 text-[12.5px] text-muted-foreground">
          Please enter the target state codes.
        </div>
        <StateMultiSelect
          selected={form.target_states}
          onChange={(v) => set('target_states', v)}
          error={errors.target_states}
        />
      </div>

      <ApplyField
        label="Primary Contact Person"
        value={form.primary_contact_name}
        onChange={(v) => set('primary_contact_name', v)}
        error={errors.primary_contact_name}
        placeholder="Full Name"
        required
      />
      <div className="grid sm:grid-cols-2 gap-5">
        <PhoneField
          label="Primary Contact Phone Number"
          value={form.primary_contact_phone}
          onChange={(v) => set('primary_contact_phone', v)}
          error={errors.primary_contact_phone}
          required
        />
        <ApplyField
          label="Primary Contact Email"
          type="email"
          value={form.primary_contact_email}
          onChange={(v) => set('primary_contact_email', v)}
          error={errors.primary_contact_email}
          placeholder="name@company.com"
          required
        />
      </div>

      <ApplyCheckbox
        label="Provide Secondary Contact Info"
        checked={!!form.provide_secondary_contact}
        onChange={(v) => set('provide_secondary_contact', v)}
      />
    </div>
  );
}