import React, { useState, useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { motion, AnimatePresence } from 'framer-motion';
import { Check, ArrowRight, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';
import { STEPS } from '@/components/apply/applyConstants';
import CompanyStep from '@/components/apply/steps/CompanyStep';
import ContactsStep from '@/components/apply/steps/ContactsStep';
import CoverageStep from '@/components/apply/steps/CoverageStep';
import CommercialsStep from '@/components/apply/steps/CommercialsStep';
import DeliveryStep from '@/components/apply/steps/DeliveryStep';
import ComplianceStep from '@/components/apply/steps/ComplianceStep';
import BillingStep from '@/components/apply/steps/BillingStep';

// Full initial form. Every key is sent to submitBuyerOnboarding using the exact
// snake_case names onboardBuyer reads. billing_type defaults to prepay.
const INITIAL = {
  // Section 1: client information
  company_name: '',
  company_website: '',
  target_states: [],
  primary_contact_name: '',
  primary_contact_phone: '',
  primary_contact_email: '',
  provide_secondary_contact: false,
  // Section 2: secondary contact
  secondary_contact_name: '',
  secondary_contact_email: '',
  secondary_contact_phone: '',
  secondary_contact_role: '',
  // Section 3: billing and accounts
  billing_address: '',
  accounts_contact_name: '',
  accounts_email: '',
  cpl: '',
  client_type: '',
  billing_type: 'prepay',
  initial_batch_size: '',
  // Section 4: lead delivery preferences
  delivery_method: [],
  api_docs_url: '',
  api_docs_file_url: '',
  buyer_api_key: '',
  unique_identifier: '',
  lead_notification_emails: [''],
  // Section 5: disposition reports and feedback (default Live Google Sheet)
  disposition_method: ['live_google_sheet'],
  // Section 6: TCPA consent information
  tcpa_inbound_phone: '',
  tcpa_outbound_phones: [''],
  tcpa_inbound_email: '',
  tcpa_outbound_email: '',
  tcpa_reply_to_email: '',
  // Section 7: additional information
  prior_experience: '',
  experience_detail: '',
  qualification_criteria: '',
  additional_requirements: '',
};

// Client side gate for each of the seven sections. The server still validates
// everything on submit. Indexes match the STEPS order, so a server field_error
// maps back to the earliest section that owns that field.
const REQUIRED_BY_STEP = [
  ['company_name', 'target_states', 'primary_contact_name', 'primary_contact_phone', 'primary_contact_email'],
  [], // secondary contact: all optional
  ['billing_address', 'cpl', 'client_type', 'billing_type'],
  ['delivery_method'],
  ['disposition_method'],
  [], // TCPA: all optional
  [], // additional information: all optional
];

// Index of the secondary contact section, skipped when the checkbox is off.
const SECONDARY_STEP = 1;

export default function Apply() {
  const [step, setStep] = useState(0);
  const [form, setForm] = useState(INITIAL);
  const [errors, setErrors] = useState({});
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState(null); // { status, company_name }
  const [globalError, setGlobalError] = useState('');
  const [token] = useState(() => { try { return new URLSearchParams(window.location.search).get('token') || ''; } catch { return ''; } });
  const [inherited, setInherited] = useState(null);
  const [linkError, setLinkError] = useState('');

  useEffect(() => {
    if (!token) return;
    base44.functions.invoke('getOnboardingContext', { token })
      .then((res) => {
        const ctx = res?.data || {};
        setInherited(ctx);
        setForm((f) => ({ ...f, company_name: ctx.company_name || f.company_name, client_type: ctx.client_type || f.client_type }));
      })
      .catch((e) => setLinkError(e?.response?.data?.error || 'This onboarding link is invalid or no longer active.'));
  }, [token]);

  const set = (key, value) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => (e[key] ? { ...e, [key]: undefined } : e));
  };

  // Whether a section is reachable. Section 2 is skipped unless the user asked
  // to provide a secondary contact.
  const isStepVisible = (i) => (i === SECONDARY_STEP ? !!form.provide_secondary_contact : true);

  const validateStep = (i = step) => {
    const req = REQUIRED_BY_STEP[i] || [];
    const next = {};
    for (const key of req) {
      const v = form[key];
      let empty;
      if (key === 'target_states' || key === 'delivery_method' || key === 'disposition_method') {
        empty = !Array.isArray(v) || v.length === 0;
      } else {
        empty = !String(v ?? '').trim();
      }
      if (empty) next[key] = 'This field is required.';
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  const goNext = () => {
    if (!validateStep()) return;
    let s = step + 1;
    while (s < STEPS.length && !isStepVisible(s)) s += 1;
    setStep(Math.min(s, STEPS.length - 1));
  };

  const goBack = () => {
    setErrors({});
    let s = step - 1;
    while (s > 0 && !isStepVisible(s)) s -= 1;
    setStep(Math.max(s, 0));
  };

  // The last reachable section, used to decide when to show the submit button.
  const lastStep = (() => {
    let s = STEPS.length - 1;
    while (s > 0 && !isStepVisible(s)) s -= 1;
    return s;
  })();

  // Strip empty repeatable rows before sending, so the operator never sees a
  // trailing blank email or phone entry.
  const buildPayload = () => {
    const emails = (form.lead_notification_emails || []).map((s) => s.trim()).filter(Boolean);
    const outbound = (form.tcpa_outbound_phones || []).map((s) => s.trim()).filter(Boolean);
    return {
      ...form,
      cpl: form.cpl === '' ? '' : Number(form.cpl),
      initial_batch_size: form.initial_batch_size === '' ? '' : Number(form.initial_batch_size),
      lead_notification_emails: emails,
      tcpa_outbound_phones: outbound,
      ...(token ? { token } : {}),
    };
  };

  const submit = async () => {
    if (!validateStep()) return;
    setSubmitting(true);
    setGlobalError('');
    try {
      const res = await base44.functions.invoke('submitBuyerOnboarding', buildPayload());
      setResult(res.data);
    } catch (e) {
      const data = e?.response?.data;
      if (data?.field_errors) {
        setErrors(data.field_errors);
        // Jump back to the earliest section that owns a field with an error.
        const firstStepWithError = REQUIRED_BY_STEP.findIndex((keys) =>
          keys.some((k) => data.field_errors[k]),
        );
        if (firstStepWithError >= 0) setStep(firstStepWithError);
        setGlobalError(data.error || 'Some fields need attention.');
      } else {
        setGlobalError(data?.error || e?.message || 'Something went wrong. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  };

  if (result) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background px-6 app-scroll">
        <motion.div
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="w-full max-w-lg rounded-2xl border border-border bg-card p-10 text-center shadow-[0_24px_64px_-24px_rgba(0,0,0,0.5)]"
        >
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-[hsl(152_65%_54%)]/15">
            <CheckCircle2 className="h-7 w-7 text-[hsl(152_65%_54%)]" />
          </div>
          <h1 className="mt-5 text-2xl font-semibold text-foreground font-heading">
            {result.status === 'duplicate' ? 'Already received' : 'Application received'}
          </h1>
          <p className="mt-2 text-sm text-muted-foreground leading-relaxed">
            {result.status === 'duplicate'
              ? `We already have a recent submission for ${result.company_name}. Our team will be in touch shortly. No need to submit again.`
              : `Thanks, ${result.company_name}. Your application is in our queue. Our onboarding team will review the details and reach out shortly.`}
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background app-scroll">
      <div className="mx-auto max-w-2xl px-6 py-12 sm:py-16">
        {/* Brand header */}
        <div className="text-center mb-10">
          <div className="text-[11px] font-mono uppercase tracking-[0.22em] text-primary">Legenex</div>
          <h1 className="mt-3 text-3xl font-semibold text-foreground font-heading">Client Onboarding Form</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Tell us about your firm and coverage needs. Takes a few minutes.
          </p>
          {inherited && (
            <p className="mt-1.5 text-[13px] text-muted-foreground">
              Onboarding for {inherited.company_name}
            </p>
          )}
        </div>

        {/* Step indicator */}
        <div className="flex items-center justify-center gap-1.5 mb-8 flex-wrap">
          {STEPS.map((s, i) => {
            if (!isStepVisible(i)) return null;
            const done = i < step;
            const active = i === step;
            return (
              <React.Fragment key={s.key}>
                <div className="flex items-center gap-2">
                  <div
                    className={`flex h-7 w-7 items-center justify-center rounded-full text-[12px] font-semibold transition-colors ${
                      done
                        ? 'bg-primary text-primary-foreground'
                        : active
                        ? 'bg-primary/15 text-primary ring-1 ring-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {done ? <Check className="h-3.5 w-3.5" /> : i + 1}
                  </div>
                </div>
                {i < STEPS.length - 1 && isStepVisible(i + 1) && <div className="h-px w-4 md:w-6 bg-border" />}
              </React.Fragment>
            );
          })}
        </div>

        {/* Card */}
        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8 shadow-[0_24px_64px_-24px_rgba(0,0,0,0.5)]">
          {linkError && (
            <div className="mb-6 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-[13px] text-primary">
              {linkError}
            </div>
          )}

          {/* Section heading */}
          <div className="mb-6">
            <div className="text-[11px] font-mono uppercase tracking-[0.18em] text-muted-foreground">
              Section {step + 1}
            </div>
            <h2 className="mt-1 text-xl font-semibold text-foreground font-heading">{STEPS[step].label}</h2>
          </div>

          <AnimatePresence mode="wait">
            <motion.div
              key={step}
              initial={{ opacity: 0, x: 16 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -16 }}
              transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            >
              {step === 0 && <CompanyStep form={form} set={set} errors={errors} locked={!!inherited} />}
              {step === 1 && <ContactsStep form={form} set={set} errors={errors} />}
              {step === 2 && <CoverageStep form={form} set={set} errors={errors} locked={!!inherited} />}
              {step === 3 && <CommercialsStep form={form} set={set} errors={errors} />}
              {step === 4 && <DeliveryStep form={form} set={set} errors={errors} />}
              {step === 5 && <ComplianceStep form={form} set={set} errors={errors} />}
              {step === 6 && <BillingStep form={form} set={set} errors={errors} />}
            </motion.div>
          </AnimatePresence>

          {globalError && (
            <div className="mt-5 rounded-lg border border-primary/30 bg-primary/10 px-3.5 py-2.5 text-[13px] text-primary">
              {globalError}
            </div>
          )}

          {/* Nav */}
          <div className="mt-7 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={goBack}
              disabled={step === 0 || submitting}
              className="inline-flex items-center gap-1.5 h-10 px-4 rounded-lg text-[13.5px] font-medium text-muted-foreground hover:text-foreground disabled:opacity-0 disabled:pointer-events-none transition-colors"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </button>

            {step < lastStep ? (
              <button
                type="button"
                onClick={goNext}
                className="inline-flex items-center gap-1.5 h-10 px-6 rounded-lg bg-primary text-primary-foreground text-[13.5px] font-semibold hover:bg-primary/90 transition-colors"
              >
                Continue <ArrowRight className="h-4 w-4" />
              </button>
            ) : (
              <button
                type="button"
                onClick={submit}
                disabled={submitting}
                className="inline-flex items-center gap-2 h-10 px-6 rounded-lg bg-primary text-primary-foreground text-[13.5px] font-semibold hover:bg-primary/90 disabled:opacity-60 transition-colors"
              >
                {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
                {submitting ? 'Submitting...' : 'Submit application'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}