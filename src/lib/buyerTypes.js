// Buyer types, in one place.
//
// The field on the Buyer entity is still `client_type` (renaming a live field is
// not allowed), but every label the operator sees says "Buyer Type". Four
// separate hardcoded copies of this list had already started to drift in their
// ordering, which is how a new type gets added in one place and silently missing
// in another.
//
// "Test" exists so internal test buyers can be classified and filtered out of
// commercial reporting instead of sitting in Unclassified forever. It is
// deliberately NOT offered on the public buyer application form.
export const BUYER_TYPES = ['Law Firm', 'Aggregator', 'Reseller', 'Network', 'Test'];

// Types a real buyer can select when applying. No Test.
export const APPLICANT_BUYER_TYPES = ['Law Firm', 'Aggregator', 'Reseller', 'Network'];

export const BUYER_TYPE_LABEL = 'Buyer Type';

export function buyerTypeOptions(types = BUYER_TYPES) {
  return types.map((t) => ({ value: t, label: t }));
}
