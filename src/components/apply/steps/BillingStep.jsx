import React from 'react';
import { ApplySelect, ApplyTextarea } from '../ApplyField';
import { YES_NO } from '../applyConstants';

// Section 7: Additional Information. Prior experience, qualification criteria,
// additional requirements, and the closing thank you line.
export default function BillingStep({ form, set, errors }) {
  return (
    <div className="space-y-5">
      <ApplySelect
        label="Have you worked with lead generation companies before?"
        value={form.prior_experience}
        onChange={(v) => set('prior_experience', v)}
        error={errors.prior_experience}
        options={YES_NO}
        placeholder="Select..."
      />

      <ApplyTextarea
        label="If so, what was your experience? Is there anything you can share that would help us improve our service to you?"
        value={form.experience_detail}
        onChange={(v) => set('experience_detail', v)}
        placeholder="Please share your experience and pet peeves."
        rows={3}
      />

      <ApplyTextarea
        label="Specific Qualification Criteria"
        value={form.qualification_criteria}
        onChange={(v) => set('qualification_criteria', v)}
        placeholder="If you have any specific qualification criteria, please specify here. ie. Treatment within 14 days etc."
        rows={3}
      />

      <ApplyTextarea
        label="Additional Requirements"
        value={form.additional_requirements}
        onChange={(v) => set('additional_requirements', v)}
        placeholder="If you have any additional criteria or requests, please specify here."
        rows={3}
      />

      <p className="text-[13px] text-muted-foreground leading-relaxed">
        Thank you for choosing LEGENEX. We look forward to a successful lasting partnership with you.
      </p>
    </div>
  );
}