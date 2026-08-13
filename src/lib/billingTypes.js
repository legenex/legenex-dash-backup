// Buyer billing arrangement values and their display labels.
export const BILLING_TYPE_OPTIONS = [
  { value: 'prepay', label: 'Prepay' },
  { value: 'net_7', label: 'Net 7' },
  { value: 'net_15', label: 'Net 15' },
  { value: 'net_30', label: 'Net 30' },
];

export function billingTypeLabel(value) {
  return BILLING_TYPE_OPTIONS.find((o) => o.value === value)?.label || 'Prepay';
}