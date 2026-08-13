// Core lead target fields for source column mapping. Custom fields are appended
// at runtime from the CustomField entity. Call fields include their own extras.
export const CORE_LEAD_FIELDS = [
  'first_name', 'last_name', 'email', 'mobile', 'zip', 'state', 'city',
  'vertical', 'brand', 'revenue', 'conv_value', 'trustedform_url',
];

// Extra fields that call platforms (Ringba / TrueCall) commonly send.
export const CALL_LEAD_FIELDS = [
  'caller_id', 'campaign', 'target', 'call_duration', 'disposition',
  'recording_url', 'revenue',
];

export const IGNORE = '__ignore__';

// Suggested default payload key -> field mappings for call providers, used to
// pre-fill the mapping table before AI/manual review.
export const CALL_DEFAULT_MAPPING = {
  ringba: {
    inboundPhoneNumber: 'mobile',
    callerId: 'caller_id',
    campaignName: 'campaign',
    targetName: 'target',
    callLengthInSeconds: 'call_duration',
    tag: 'disposition',
    recordingUrl: 'recording_url',
    conversionAmount: 'revenue',
  },
  truecall: {
    caller_number: 'mobile',
    caller_id: 'caller_id',
    campaign: 'campaign',
    target: 'target',
    duration: 'call_duration',
    disposition: 'disposition',
    recording_url: 'recording_url',
    payout: 'revenue',
  },
};