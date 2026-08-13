import React from 'react';
import { ApplyField, PhoneField } from '../ApplyField';

// Section 2: Secondary Contact. Only reached when the checkbox in section 1 is
// ticked (the parent skips this step otherwise).
export default function ContactsStep({ form, set, errors }) {
  return (
    <div className="space-y-5">
      <ApplyField
        label="Secondary Contact Person (if applicable)"
        value={form.secondary_contact_name}
        onChange={(v) => set('secondary_contact_name', v)}
        error={errors.secondary_contact_name}
        placeholder="Full Name"
      />
      <ApplyField
        label="Secondary Contact Email"
        type="email"
        value={form.secondary_contact_email}
        onChange={(v) => set('secondary_contact_email', v)}
        error={errors.secondary_contact_email}
        placeholder="name@company.com"
      />
      <PhoneField
        label="Secondary Contact Phone Number"
        value={form.secondary_contact_phone}
        onChange={(v) => set('secondary_contact_phone', v)}
        error={errors.secondary_contact_phone}
      />
      <ApplyField
        label="Secondary Contact Role"
        value={form.secondary_contact_role}
        onChange={(v) => set('secondary_contact_role', v)}
        error={errors.secondary_contact_role}
        placeholder="Role"
      />
    </div>
  );
}