// What a connected data source is for. The purpose decides where its rows are
// written, so it is asked first and everything after it is shaped by the answer.
// Shared by the sheet dialog, the sheet list and the inbound webhook editor so
// the two surfaces cannot drift apart.

export const SHEET_PURPOSES = [
  {
    value: 'leads',
    label: 'Leads',
    short: 'Leads',
    desc: 'Rows become leads through the normal pipeline: validation, dedup, conversion events and revenue all run.',
    writesTo: 'Lead, through processLead',
    needsMatch: false,
    needsApiKey: true,
  },
  {
    value: 'buyer_feedback',
    label: 'Buyer feedback',
    short: 'Feedback',
    desc: 'Buyer dispositions posted back against leads you already sold them. Matched rows write a feedback record and update the lead verdict.',
    writesTo: 'BuyerFeedback, and the verdict fields on Lead',
    needsMatch: true,
    needsApiKey: false,
  },
  {
    value: 'inbound_calls',
    label: 'Inbound calls',
    short: 'Calls',
    desc: 'Calls with their qualified flag and payout, e.g. a Walker AG1 report. Each row becomes a call record you can see under Leads, Calls.',
    writesTo: 'CallRecord',
    needsMatch: false,
    needsApiKey: false,
  },
  {
    value: 'call_attribution',
    label: 'Call attribution feed',
    short: 'Attribution',
    desc: 'A Ringba style export carrying the numbers alongside sid and ssid. Creates no calls: it finds calls already recorded on that number and fills in which supplier sent them.',
    writesTo: 'The sid, ssid and supplier on existing CallRecords',
    needsMatch: false,
    needsApiKey: false,
  },
  {
    value: 'disqualified',
    label: 'Disqualified leads',
    short: 'DQ',
    desc: 'Leads a buyer or call centre rejected, with the reason. Records the DQ outcome against the matched lead.',
    writesTo: 'BuyerFeedback, and optionally the lead status',
    needsMatch: true,
    needsApiKey: false,
  },
  {
    value: 'cost',
    label: 'Cost and spend',
    short: 'Cost',
    desc: 'Daily spend by supplier, for true cost per lead. Rows become ad spend records attributed to the linked supplier.',
    writesTo: 'AdSpend',
    needsMatch: false,
    needsApiKey: false,
  },
];

export const WEBHOOK_PURPOSES = [
  {
    value: 'lead_outcome',
    label: 'Lead outcome',
    desc: 'A buyer or platform posting a lifecycle status against a lead. This is the default and what every existing webhook does.',
  },
  {
    value: 'buyer_feedback',
    label: 'Buyer feedback',
    desc: 'Buyer dispositions. Updates the lead and also leaves a feedback record per receipt.',
  },
  {
    value: 'inbound_call',
    label: 'Inbound call',
    desc: 'Call outcomes and payouts from a call platform or a Sheets script.',
  },
  {
    value: 'cost',
    label: 'Cost and spend',
    desc: 'Daily spend. Needs a date and a spend amount on the payload, and records no lead.',
  },
];

// Fields a row or payload can be matched on, in the order an operator thinks of
// them. Value is our field name; the sheet column or payload key is chosen
// separately, because a sender rarely names it the same way.
export const MATCH_FIELDS = [
  { value: 'email', label: 'Email' },
  { value: 'mobile', label: 'Mobile number' },
  { value: 'lead_id', label: 'Lead ID (the sender\u2019s ID)' },
  { value: 'id', label: 'Legenex record ID' },
];

export const purposeMeta = (list, value) => list.find((p) => p.value === value) || list[0];
