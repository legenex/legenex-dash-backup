import React from 'react';
import { ApplyField } from '../ApplyField';

// Section 6: TCPA Consent Information. Outbound phone numbers are entered as a
// comma separated string in the original form, but stored as an array.
export default function ComplianceStep({ form, set, errors }) {
  // Present the outbound phones array as a comma separated string for editing.
  const outboundText = Array.isArray(form.tcpa_outbound_phones)
    ? form.tcpa_outbound_phones.join(', ')
    : (form.tcpa_outbound_phones || '');
  const setOutbound = (text) => {
    const list = text.split(',').map((s) => s.trim()).filter(Boolean);
    set('tcpa_outbound_phones', list);
  };

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground leading-relaxed">
        To ensure compliance with the new TCPA regulations, we need to gather specific information
        related to your contact details for leads. Please provide the following information to help
        us update our processes and maintain compliance.
      </p>

      <div>
        <ApplyField
          label="Inbound Phone Number"
          value={form.tcpa_inbound_phone}
          onChange={(v) => set('tcpa_inbound_phone', v)}
          error={errors.tcpa_inbound_phone}
          placeholder="+1 512 555 0123"
        />
        <div className="mt-1 text-[12px] text-muted-foreground">Phone Number that leads can contact</div>
      </div>

      <div>
        {/* Stored as an array; edited here as a comma separated string per the original form. */}
        <ApplyField
          label="Outbound Phone Number"
          value={outboundText}
          onChange={setOutbound}
          error={errors.tcpa_outbound_phones}
          placeholder="+1 512 555 0199, +1 512 555 0200"
        />
        <div className="mt-1 text-[12px] text-muted-foreground">
          Phone number that leads will be contacted from (comma separate if multiple)
        </div>
      </div>

      <div>
        <ApplyField
          label="Inbound Email Address"
          type="email"
          value={form.tcpa_inbound_email}
          onChange={(v) => set('tcpa_inbound_email', v)}
          error={errors.tcpa_inbound_email}
          placeholder="contact@company.com"
        />
        <div className="mt-1 text-[12px] text-muted-foreground">Email address that leads can email</div>
      </div>

      <div>
        <ApplyField
          label="Outbound Email Address"
          type="email"
          value={form.tcpa_outbound_email}
          onChange={(v) => set('tcpa_outbound_email', v)}
          error={errors.tcpa_outbound_email}
          placeholder="outbound@company.com"
        />
        <div className="mt-1 text-[12px] text-muted-foreground">Email address that leads will be emailed from</div>
      </div>

      <div>
        <ApplyField
          label="Reply-To Email Address"
          type="email"
          value={form.tcpa_reply_to_email}
          onChange={(v) => set('tcpa_reply_to_email', v)}
          error={errors.tcpa_reply_to_email}
          placeholder="replies@company.com"
        />
        <div className="mt-1 text-[12px] text-muted-foreground">Can be same as inbound email</div>
      </div>
    </div>
  );
}