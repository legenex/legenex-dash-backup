import React from 'react';
import { useSearchParams } from 'react-router-dom';
import { usePermissions } from '@/lib/AuthContext';
import SectionShell from '@/components/layout/SectionShell';
import SettingsNav from '@/components/settings/SettingsNav';
import SettingsShell from '@/components/settings/SettingsShell';
import SettingsErrorBoundary from '@/components/settings/SettingsErrorBoundary';
import SettingsGeneral from '@/components/settings/SettingsGeneral';
import SettingsUsers from '@/components/settings/SettingsUsers';
import SettingsIntegrations from '@/components/settings/SettingsIntegrations';
import SettingsDataSources from '@/components/settings/SettingsDataSources';
import SettingsCustomFields from '@/components/settings/SettingsCustomFields';
import SettingsFieldMapping from '@/components/settings/SettingsFieldMapping';
import SettingsApiKeys from '@/components/settings/SettingsApiKeys';
import SettingsInboundWebhooks from '@/components/settings/SettingsInboundWebhooks';
import SettingsChatBot from '@/components/settings/SettingsChatBot';
import SettingsBilling from '@/components/settings/SettingsBilling';
import SettingsIgnoreList from '@/components/settings/SettingsIgnoreList';
import SettingsProfile from '@/components/settings/SettingsProfile';
import SettingsAudits from '@/components/settings/SettingsAudits';
import SettingsDashboard from '@/components/settings/SettingsDashboard';
import ErrorLogs from '@/pages/ErrorLogs';

// NAV is built inside the component so items the user cannot access are
// omitted entirely rather than shown and then blocked.
function buildNav(isAdmin, can) {
  const allow = (key) => key == null || can(key);
  const account = [
    { key: 'dashboard', label: 'Dashboard' },
    { key: 'profile', label: 'Profile' },
    { key: 'general', label: 'General', perm: 'set_integrations' },
    { key: 'users', label: 'Users and Roles', perm: 'set_users' },
  ].filter((i) => allow(i.perm));

  const data = [
    { key: 'integrations', label: 'Integrations', perm: 'set_integrations' },
    { key: 'data-sources', label: 'Data Sources', perm: 'set_data_sources' },
    { key: 'fields', label: 'Custom Fields', perm: 'set_custom_fields' },
    { key: 'field-mapping', label: 'Field Mapping', perm: 'set_field_mapping' },
    { key: 'apikeys', label: 'API Keys', perm: 'set_api_keys' },
    ...(isAdmin ? [{ key: 'inbound-webhooks', label: 'Webhooks' }] : []),
    { key: 'errors', label: 'Error Logs', perm: 'set_error_logs' },
    { key: 'audits', label: 'Audits', perm: 'set_integrations' },
    { key: 'chatbot', label: 'ChatBot', perm: null },
    { key: 'billing', label: 'Billing and Plan', perm: 'set_billing' },
  ].filter((i) => allow(i.perm));

  return [
    { group: 'Account', items: account },
    ...(data.length ? [{ group: 'Data', items: data }] : []),
  ];
}

// tab key -> { title (page name in header), subtitle, panel }
const PANELS = {
  dashboard: { title: 'Dashboard', subtitle: 'What is connected, what is live, and what needs attention.', node: null },
  profile: { title: 'Profile', subtitle: 'Your account details.', node: <SettingsProfile /> },
  general: { title: 'General', subtitle: 'Workspace defaults.', node: <SettingsGeneral /> },
  users: { title: 'Users and Roles', subtitle: 'Team members and permissions.', node: <SettingsUsers /> },
  integrations: { title: 'Integrations', subtitle: 'Connected services and providers.', node: <SettingsIntegrations /> },
  'data-sources': { title: 'Data Sources', subtitle: 'Inbound lead sources.', node: <SettingsDataSources /> },
  fields: { title: 'Custom Fields', subtitle: 'The lead field catalog.', node: <SettingsCustomFields /> },
  'field-mapping': { title: 'Field Mapping', subtitle: 'Incoming key to field mapping.', node: <SettingsFieldMapping /> },
  apikeys: { title: 'API Keys', subtitle: 'Gateway and supplier keys.', node: <SettingsApiKeys /> },
  'inbound-webhooks': { title: 'Webhooks', subtitle: 'Posts we receive, and pulls we make on a schedule.', node: <SettingsInboundWebhooks />, adminOnly: true },
  errors: { title: 'Error Logs', subtitle: 'Pipeline failures and reasons.', node: <ErrorLogs embedded /> },
  audits: { title: 'Audits', subtitle: 'Read-only evaluation harness: runtime probes and findings.', node: <SettingsAudits /> },
  chatbot: { title: 'ChatBot', subtitle: 'AI assistant conversations, memories, and knowledge base.', node: <SettingsChatBot /> },
  billing: { title: 'Billing and Plan', subtitle: 'Plan and billing.', node: <SettingsBilling /> },
  adaptive: { title: 'Ignore List', subtitle: 'Fields excluded from cataloging.', node: <SettingsIgnoreList /> },
};

const VALID = Object.keys(PANELS);

// Permission required to view each tab. Anything absent is always viewable
// (your own profile, the status board). Kept beside PANELS so a new tab cannot
// be added without a conscious decision about who may see it.
const TAB_PERMS = {
  general: 'set_integrations',
  users: 'set_users',
  integrations: 'set_integrations',
  'data-sources': 'set_data_sources',
  fields: 'set_custom_fields',
  'field-mapping': 'set_field_mapping',
  apikeys: 'set_api_keys',
  errors: 'set_error_logs',
  audits: 'set_integrations',
  chatbot: null,
  billing: 'set_billing',
  adaptive: 'set_custom_fields',
};

export default function Settings() {
  const [searchParams, setSearchParams] = useSearchParams();
  const { realRole, can } = usePermissions();
  const isAdmin = realRole === 'admin' || realRole === 'owner';
  const raw = searchParams.get('tab') || 'dashboard';
  let tab = VALID.includes(raw) ? raw : 'dashboard';
  // Fail closed. A non-admin reaching an admin-only tab directly, or anyone
  // reaching a tab their role does not permit, lands on the dashboard rather
  // than on a panel they should not see.
  if (PANELS[tab]?.adminOnly && !isAdmin) tab = 'dashboard';
  if (TAB_PERMS[tab] && !can(TAB_PERMS[tab])) tab = 'dashboard';
  const setTab = (v) => setSearchParams({ tab: v }, { replace: true });

  const panel = PANELS[tab];
  const nav = buildNav(isAdmin, can);

  return (
    <SectionShell nav={<SettingsNav groups={nav} active={tab} onSelect={setTab} />}>
      <SettingsShell title={panel.title} subtitle={panel.subtitle}>
        <SettingsErrorBoundary key={tab}>
          {/* The dashboard needs isAdmin and the tab setter, so it is rendered
              here rather than held as a static node in PANELS. */}
          {tab === 'dashboard'
            ? <SettingsDashboard isAdmin={isAdmin} />
            : panel.node}
        </SettingsErrorBoundary>
      </SettingsShell>
    </SectionShell>
  );
}