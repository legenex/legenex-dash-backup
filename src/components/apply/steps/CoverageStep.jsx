import React from 'react';
import { ApplyField, ApplySelect } from '../ApplyField';
import { CLIENT_TYPES, BILLING_TYPES } from '../applyConstants';

// Section 3: Billing and Accounts. Also carries the client_type and billing_type
// selects that onboardBuyer needs (not in the original form) plus the optional
// initial batch size, and the static taxpayer form and payment links.
export default function CoverageStep({ form, set, errors, locked }) {
  const pickClientType = (ct) => {
    set('client_type', ct);
    // Sensible default billing arrangement for the chosen client type.
    if (ct === 'Law Firm') set('billing_type', 'prepay');
    else if (ct === 'Aggregator') set('billing_type', 'invoiced_daily');
  };

  return (
    <div className="space-y-5">
      <ApplyField
        label="Billing Address"
        value={form.billing_address}
        onChange={(v) => set('billing_address', v)}
        error={errors.billing_address}
        placeholder="Billing Address"
        required
      />

      <div className="grid sm:grid-cols-2 gap-5">
        <ApplyField
          label="Accounts Contact Person"
          value={form.accounts_contact_name}
          onChange={(v) => set('accounts_contact_name', v)}
          error={errors.accounts_contact_name}
          placeholder="Full Name"
        />
        <ApplyField
          label="Accounts Email"
          type="email"
          value={form.accounts_email}
          onChange={(v) => set('accounts_email', v)}
          error={errors.accounts_email}
          placeholder="accounts@company.com"
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-5">
        <ApplyField
          label="Lead Price"
          type="number"
          value={form.cpl}
          onChange={(v) => set('cpl', v)}
          error={errors.cpl}
          placeholder="45"
          required
        />
        <ApplyField
          label="Initial Batch Size"
          type="number"
          value={form.initial_batch_size}
          onChange={(v) => set('initial_batch_size', v)}
          error={errors.initial_batch_size}
          placeholder="100"
        />
      </div>

      <ApplySelect
        label="Buyer Type"
        value={form.client_type}
        onChange={pickClientType}
        error={errors.client_type}
        options={CLIENT_TYPES.map((ct) => ({ value: ct, label: ct }))}
        placeholder="Select client type..."
        required
        disabled={locked}
      />

      <div>
        <ApplySelect
          label="Billing Type"
          value={form.billing_type}
          onChange={(v) => set('billing_type', v)}
          error={errors.billing_type}
          options={BILLING_TYPES}
          placeholder="Select billing type..."
        />
        <div className="mt-2 text-[12px] text-muted-foreground">
          Law firms pay upfront and aggregators are invoiced.
        </div>
      </div>

      <div className="rounded-xl border border-border bg-background/50 p-4 space-y-3">
        <div>
          <div className="text-[13px] font-semibold text-foreground">Tax Payer Identification Form</div>
          {/* Static link. The operator sets the real href later. Not wired to any per buyer document. */}
          <a
            href="#"
            className="mt-1 inline-block text-[13px] font-medium text-primary hover:underline"
          >
            Click Here To Download The Signed Taxpayer Identification Form
          </a>
        </div>
        <div>
          <div className="text-[13px] font-semibold text-foreground">Payment Link</div>
          {/* Static link. The operator sets the real href later. Not wired to Stripe. */}
          <a
            href="#"
            className="mt-1 inline-block text-[13px] font-medium text-primary hover:underline"
          >
            Click Here To Pay The Deposit (If You Haven't Done So Already)
          </a>
        </div>
      </div>
    </div>
  );
}