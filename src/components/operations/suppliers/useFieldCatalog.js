import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';

// Assembles the same field catalog the rest of the app uses for condition
// builders: custom field names, calculated field output tokens, and the known
// system date / verification fields. Also returns value option lists for
// calculated fields (date age buckets, value maps) keyed by their token, so a
// rule can pick a bucket label rather than typing it.
//
// Read only. Mirrors ConnectorFilterPanel so a tier rule references the exact
// same fields as a connector filter, including date_age_bucket calculated
// fields and accident_type.
export function useFieldCatalog() {
  const { data: customFields = [] } = useQuery({
    queryKey: ['custom-fields'],
    queryFn: () => base44.entities.CustomField.list('sort_order', 500),
  });
  const { data: calcs = [] } = useQuery({
    queryKey: ['custom-calculations'],
    queryFn: () => base44.entities.CustomCalculation.list(),
  });

  const fieldOptions = [...new Set([
    ...customFields.map((f) => f.field_name),
    ...calcs.map((c) => c.output_token).filter(Boolean),
    'accident_date', 'accident_date_2', 'incident_date_3', 'has_attorney', 'phone_verified', 'hlr_status', 'hlr_score',
  ])].filter(Boolean);

  const fieldValueOptions = {};
  for (const c of calcs) {
    if (!c.output_token) continue;
    let cfg = {};
    try { cfg = JSON.parse(c.config || '{}'); } catch { /* ignore */ }
    let opts = [];
    if (c.transform_type === 'date_age_bucket') {
      if (Array.isArray(cfg.buckets)) opts = cfg.buckets.map((b) => ({ value: b.label, label: b.label })).filter((o) => o.value);
      if (cfg.fallback) opts.push({ value: cfg.fallback, label: cfg.fallback });
    } else if (c.transform_type === 'value_map' && cfg.map && typeof cfg.map === 'object') {
      opts = [...new Set(Object.values(cfg.map))].map((to) => ({ value: to, label: to }));
    }
    if (opts.length > 0) fieldValueOptions[c.output_token] = opts;
  }

  return { fieldOptions, fieldValueOptions, calcs, customFields };
}