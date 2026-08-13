import React from 'react';
import { ApplyField, CheckboxGroup, EmailListField } from '../ApplyField';
import { DELIVERY_METHODS } from '../applyConstants';

// Section 4: Lead Delivery Preferences. delivery_method is stored as an array
// (check all that apply) even though the value set is api_post / email / both.
export default function CommercialsStep({ form, set, errors }) {
  const methods = Array.isArray(form.delivery_method) ? form.delivery_method : [];
  const showApi = methods.includes('api_post') || methods.includes('both');
  const showEmail = methods.includes('email') || methods.includes('both');

  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground leading-relaxed">
        We offer multiple options for lead delivery, including API posting to your CRM, email
        notifications, and ping post. Please select your preferred method or methods of lead
        delivery from the options provided. If you choose email notifications, kindly provide the
        relevant email address or addresses for prompt delivery.
      </p>

      <CheckboxGroup
        label="Preferred Lead Delivery Method (Check all that apply)"
        options={DELIVERY_METHODS}
        values={methods}
        onChange={(v) => set('delivery_method', v)}
        error={errors.delivery_method}
        required
      />

      {showApi && (
        <div className="space-y-5 rounded-xl border border-border bg-background/50 p-4">
          <ApplyField
            label="API Documentation URL (If Applicable)"
            value={form.api_docs_url}
            onChange={(v) => set('api_docs_url', v)}
            error={errors.api_docs_url}
            placeholder="https://company.com/api-docs"
          />
          {/* File uploads need an authenticated storage context that is not
              available on this public, unauthenticated route, so we accept a
              plain URL to the hosted API documentation instead of blocking. */}
          <div>
            <ApplyField
              label="API Documentation (If Applicable)"
              value={form.api_docs_file_url}
              onChange={(v) => set('api_docs_file_url', v)}
              error={errors.api_docs_file_url}
              placeholder="Link to a hosted PDF, DOC, XLS, CSV or image"
            />
            <div className="mt-1 text-[12px] text-muted-foreground">
              Accepts PDF, DOC/DOCX, XLS/CSV, JPG/JPEG, PNG, GIF. Paste a link to your hosted file.
            </div>
          </div>
          <div>
            <ApplyField
              label="API Key (If Applicable)"
              value={form.buyer_api_key}
              onChange={(v) => set('buyer_api_key', v)}
              error={errors.buyer_api_key}
              placeholder="API key"
            />
            <div className="mt-1 text-[12px] text-muted-foreground">
              Most CRMs and APIs need API keys for supplier tracking and security. If unavailable,
              add a unique identifier below.
            </div>
          </div>
          <div>
            <ApplyField
              label="Unique Identifier"
              value={form.unique_identifier}
              onChange={(v) => set('unique_identifier', v)}
              error={errors.unique_identifier}
              placeholder="Campaign ID, Supplier ID, or Source Key"
            />
            <div className="mt-1 text-[12px] text-muted-foreground">
              This can be a Campaign ID, Supplier ID, or Source Key, anything that links the leads
              we send back to us.
            </div>
          </div>
        </div>
      )}

      {showEmail && (
        <div className="rounded-xl border border-border bg-background/50 p-4">
          <EmailListField
            label="Lead Notification Email Address"
            values={form.lead_notification_emails}
            onChange={(v) => set('lead_notification_emails', v)}
          />
          <div className="mt-2 text-[12px] text-muted-foreground">
            Email addresses for lead notifications.
          </div>
        </div>
      )}
    </div>
  );
}