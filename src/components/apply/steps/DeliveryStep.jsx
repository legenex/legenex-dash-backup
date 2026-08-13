import React from 'react';
import { CheckboxGroup } from '../ApplyField';
import { DISPOSITION_METHODS } from '../applyConstants';

// Section 5: Disposition Reports and Feedback. At least one method required.
export default function DeliveryStep({ form, set, errors }) {
  const values = Array.isArray(form.disposition_method) ? form.disposition_method : [];
  return (
    <div className="space-y-5">
      <p className="text-[13px] text-muted-foreground leading-relaxed">
        It is vital to receive regular disposition reports and feedback in order to optimize the
        campaigns towards achieving a cost of acquisition that is acceptable.
      </p>

      <CheckboxGroup
        label="Best way to send disposition reports (Check all that apply)"
        options={DISPOSITION_METHODS}
        values={values}
        onChange={(v) => set('disposition_method', v)}
        error={errors.disposition_method}
        required
      />
    </div>
  );
}