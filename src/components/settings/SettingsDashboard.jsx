import React from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { usePermissions } from '@/lib/AuthContext';
import {
  Plug, KeyRound, Users, Database, ListTree, Shuffle,
  Webhook, AlertTriangle, ShieldCheck, BookOpen, CreditCard, UserCircle, Cog,
} from 'lucide-react';

// Settings landing page: a compact status board.
//
// Every other section (Operations, Tools, Lead Distribution) opens on a
// dashboard answering "what is connected and what needs attention" before
// asking you to pick a sub-page. Settings opened straight onto a form, so a
// disconnected integration or a pile of unresolved errors stayed invisible
// until you happened to click into it.
//
// Tiles are deliberately dense. A settings board is scanned, not read, so each
// tile is one label, one number and one hint. Only tiles the current user has
// permission for are rendered, so an operator never sees a door they cannot
// open.

// Compact stat tile. Two across on a phone, four on a wide screen.
function StatTile({ to, icon: Icon, label, value, hint, tone = 'ok' }) {
  const dot =
    tone === 'error' ? 'bg-destructive'
      : tone === 'warn' ? 'bg-status-unsold'
        : 'bg-status-sold';

  return (
    <Link
      to={to}
      className="group rounded-[10px] border border-border bg-card p-3 flex flex-col gap-1.5 hover:border-primary/40 transition-colors min-w-0"
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="w-4 h-4 text-primary shrink-0" />
        <span className="text-[12px] font-medium text-foreground truncate group-hover:text-primary transition-colors">
          {label}
        </span>
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ml-auto ${dot}`} />
      </div>
      <div className="text-[19px] sm:text-[21px] font-bold font-mono tabular-nums text-foreground truncate leading-tight">
        {value}
      </div>
      <p className="text-[10.5px] text-muted-foreground truncate">{hint}</p>
    </Link>
  );
}

export default function SettingsDashboard({ isAdmin }) {
  const { can } = usePermissions();
  const opts = { staleTime: 60_000 };

  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: () => base44.entities.User.list(), ...opts });
  const { data: apiKeys = [] } = useQuery({ queryKey: ['api-keys'], queryFn: () => base44.entities.ApiKey.list('-created_date', 200), ...opts });
  const { data: integrations = [] } = useQuery({ queryKey: ['integration-configs'], queryFn: () => base44.entities.IntegrationConfig.list(), ...opts });
  const { data: errors = [] } = useQuery({ queryKey: ['error-logs'], queryFn: () => base44.entities.ErrorLog.list('-created_date', 500), ...opts });
  const { data: suppliers = [] } = useQuery({ queryKey: ['suppliers'], queryFn: () => base44.entities.Supplier.list(), ...opts });
  const { data: customFields = [] } = useQuery({ queryKey: ['custom-fields'], queryFn: () => base44.entities.CustomField.list('-created_date', 500), ...opts });
  const { data: mappings = [] } = useQuery({ queryKey: ['field-mappings'], queryFn: () => base44.entities.FieldMapping.list('-created_date', 500), ...opts });
  const { data: docs = [] } = useQuery({ queryKey: ['kb-docs'], queryFn: () => base44.entities.KnowledgeDoc.list('-created_date', 200), ...opts });
  const { data: audits = [] } = useQuery({ queryKey: ['audit-runs'], queryFn: () => base44.entities.AuditRun.list('-created_date', 20), ...opts });

  const isConnected = (i) => i.connected || i.enabled || i.status === 'connected';
  const connected = integrations.filter(isConnected).length;
  const notConnected = integrations.length - connected;
  const unresolved = errors.filter((e) => !e.resolved).length;
  const activeSuppliers = suppliers.filter((s) => s.active).length;

  // perm null means always visible: your own profile, workspace defaults, and
  // the admin-only webhook route which is gated separately.
  const tiles = [
    { perm: 'set_integrations', tab: 'integrations', icon: Plug, label: 'Integrations',
      value: `${connected} of ${integrations.length}`,
      hint: notConnected > 0 ? `${notConnected} not connected` : 'all connected',
      tone: notConnected > 0 ? 'warn' : 'ok' },

    { perm: 'set_data_sources', tab: 'data-sources', icon: Database, label: 'Data Sources',
      value: suppliers.length, hint: `${activeSuppliers} active`,
      tone: activeSuppliers === 0 ? 'warn' : 'ok' },

    { perm: 'set_api_keys', tab: 'apikeys', icon: KeyRound, label: 'API Keys',
      value: apiKeys.length, hint: apiKeys.length === 0 ? 'none issued' : 'gateway live',
      tone: apiKeys.length === 0 ? 'warn' : 'ok' },

    { perm: 'set_users', tab: 'users', icon: Users, label: 'Users and Roles',
      value: users.length, hint: users.length === 1 ? 'single operator' : 'team access' },

    { perm: 'set_custom_fields', tab: 'fields', icon: ListTree, label: 'Custom Fields',
      value: customFields.length, hint: customFields.length === 0 ? 'none catalogued' : 'catalogued' },

    { perm: 'set_field_mapping', tab: 'field-mapping', icon: Shuffle, label: 'Field Mapping',
      value: mappings.length, hint: mappings.length === 0 ? 'unmapped intake' : 'mapped',
      tone: mappings.length === 0 ? 'warn' : 'ok' },

    { perm: 'set_error_logs', tab: 'errors', icon: AlertTriangle, label: 'Error Logs',
      value: unresolved, hint: unresolved > 0 ? 'needs review' : 'clean',
      tone: unresolved > 0 ? 'error' : 'ok' },

    { perm: 'set_integrations', tab: 'audits', icon: ShieldCheck, label: 'Audits',
      value: audits.length, hint: audits.length ? 'last run recorded' : 'never run',
      tone: audits.length ? 'ok' : 'warn' },

    { perm: 'set_knowledge_base', tab: 'knowledge', icon: BookOpen, label: 'Knowledge Base',
      value: docs.length, hint: docs.length === 0 ? 'assistant unfed' : 'indexed',
      tone: docs.length === 0 ? 'warn' : 'ok' },

    { perm: null, tab: 'general', icon: Cog, label: 'General',
      value: '\u2014', hint: 'workspace defaults' },

    { perm: null, tab: 'profile', icon: UserCircle, label: 'Profile',
      value: '\u2014', hint: 'your account' },

    { perm: 'set_billing', tab: 'billing', icon: CreditCard, label: 'Billing and Plan',
      value: '\u2014', hint: 'plan and invoices' },

    ...(isAdmin ? [{ perm: null, tab: 'inbound-webhooks', icon: Webhook, label: 'Webhooks',
      value: '\u2014', hint: 'outcome routing' }] : []),
  ].filter((t) => t.perm === null || can(t.perm));

  // Only surface problems this user can actually act on.
  const alerts = [
    unresolved > 0 && can('set_error_logs') && { tab: 'errors', text: `${unresolved} unresolved pipeline error${unresolved === 1 ? '' : 's'}` },
    notConnected > 0 && can('set_integrations') && { tab: 'integrations', text: `${notConnected} integration${notConnected === 1 ? '' : 's'} not connected` },
  ].filter(Boolean);

  return (
    <div>
      {alerts.length > 0 && (
        <div className="mb-4 rounded-[10px] border border-status-unsold bg-status-unsold px-3.5 py-3">
          <div className="flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 status-unsold shrink-0 mt-px" />
            <div className="min-w-0">
              <p className="text-[12px] font-semibold text-foreground">Needs attention</p>
              <div className="flex flex-wrap gap-x-4 gap-y-1 mt-1">
                {alerts.map((a) => (
                  <Link
                    key={a.tab}
                    to={`/settings?tab=${a.tab}`}
                    className="text-[12px] text-muted-foreground underline underline-offset-2 hover:text-foreground"
                  >
                    {a.text}
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
        {tiles.map((t) => (
          <StatTile
            key={t.tab}
            to={`/settings?tab=${t.tab}`}
            icon={t.icon}
            label={t.label}
            value={t.value}
            hint={t.hint}
            tone={t.tone}
          />
        ))}
      </div>
    </div>
  );
}
