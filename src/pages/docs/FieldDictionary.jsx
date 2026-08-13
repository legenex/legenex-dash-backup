import React from 'react';
import { DocPage, Section, FieldTable, InlineCode, ReqBadge, Callout } from '@/components/docs/DocsUI';

const cols = [
  { key: 'field', label: 'Field', className: 'w-52' },
  { key: 'type', label: 'Type', className: 'w-24' },
  { key: 'req', label: '', className: 'w-24' },
  { key: 'desc', label: 'Description' },
];

const IDENTITY = [
  { field: <InlineCode>first_name</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Lead first name. Alias: firstname.' },
  { field: <InlineCode>last_name</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Lead last name. Alias: lastname.' },
  { field: <InlineCode>email</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Email address. Format + MX validated (see email_valid).' },
  { field: <InlineCode>mobile</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Mobile phone. Aliases: phone, phone1, phone_number.' },
  { field: <InlineCode>zip</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Postal / ZIP code. Alias: zipcode.' },
  { field: <InlineCode>ip_address</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Originating IP of the opt-in. Alias: ipaddress.' },
];

const CASE = [
  { field: <InlineCode>accident_state</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Two-letter state where the incident occurred.' },
  { field: <InlineCode>accident_type</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Type of accident/case (e.g. auto).' },
  { field: <InlineCode>accident_details</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Free-text case description.' },
  { field: <InlineCode>fault</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Was the lead at fault. Aliases: at_fault, atfault.' },
  { field: <InlineCode>injured</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Whether the lead was injured.' },
  { field: <InlineCode>treatment</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Received medical treatment. Aliases: injury, physical_injury.' },
  { field: <InlineCode>attorney</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Already represented. Aliases: lawyer, has_attorney, with_lawyer.' },
];

const COMPLIANCE = [
  { field: <InlineCode>trustedform_url</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'TrustedForm cert URL. Must match cert.trustedform.com/<40-hex>. Alias: trustedform_cert.' },
  { field: <InlineCode>optin_url</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Landing/opt-in page URL. Aliases: optinurl, landing_page_url.' },
  { field: <InlineCode>jornaya_token</InlineCode>, type: 'string', req: <ReqBadge />, desc: 'Jornaya LeadiD token. Aliases: jornaya_leadid, leadid_token.' },
];

const TRACKING = [
  { field: <InlineCode>sid</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Sub-source identifier for attribution reporting.' },
  { field: <InlineCode>s1</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Click / tracking id passed back on postbacks.' },
  { field: <InlineCode>utm_source</InlineCode>, type: 'string', req: <ReqBadge required />, desc: 'Traffic source.' },
  { field: <InlineCode>lead_route</InlineCode>, type: 'string', req: <ReqBadge />, desc: 'Routing hint: standard (default), direct, data, event, queue, test.' },
  { field: <InlineCode>lead_status</InlineCode>, type: 'string', req: <ReqBadge />, desc: 'Pre-classification hint (Qualified, Disqualified, or a custom status). Omit for normal processing.' },
];

const SYSTEM = [
  { field: <InlineCode>phone_verified</InlineCode>, type: 'string', req: <ReqBadge />, desc: 'System-populated from the HLR lookup. If you send a value inbound it is used as a fallback when HLR does not run.' },
  { field: <InlineCode>email_valid</InlineCode>, type: 'string', req: <ReqBadge />, desc: 'System-populated: "Yes"/"No" from format + MX validation. Not accepted inbound.' },
  { field: <InlineCode>lead_id</InlineCode>, type: 'number', req: <ReqBadge />, desc: 'System-assigned unique sequential id, returned in the response. Not accepted inbound.' },
  { field: <InlineCode>revenue</InlineCode>, type: 'number', req: <ReqBadge />, desc: 'System-captured on sold leads. Returned only when your key exposes revenue.' },
];

export default function FieldDictionary() {
  return (
    <DocPage
      title="Field Dictionary"
      subtitle="Every field the ingestion endpoint accepts. Unknown fields are captured automatically and stored on the lead."
    >
      <Callout>
        Required fields are configurable per account. The lists below reflect the standard MVA intake configuration.
        Your integration guide on the Posting Specs tab shows the exact required set for your supplier.
      </Callout>

      <Section title="Identity"><FieldTable columns={cols} rows={IDENTITY} /></Section>
      <Section title="Case details"><FieldTable columns={cols} rows={CASE} /></Section>
      <Section title="Compliance & consent"><FieldTable columns={cols} rows={COMPLIANCE} /></Section>
      <Section title="Attribution & routing"><FieldTable columns={cols} rows={TRACKING} /></Section>
      <Section title="System fields">
        <p>These are populated by the platform. <InlineCode>phone_verified</InlineCode> is the one you may optionally seed inbound.</p>
        <FieldTable columns={cols} rows={SYSTEM} />
      </Section>
    </DocPage>
  );
}