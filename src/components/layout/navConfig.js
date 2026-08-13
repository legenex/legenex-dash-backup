import { LayoutDashboard, FileText, Share2, Wrench, Settings as SettingsIcon, BarChart3, Wallet, SlidersHorizontal, Megaphone, CheckCircle2, XCircle, Ban, Slash, Clock, Layers, Users, Truck, Zap, Webhook, TrendingUp, CalendarDays, Target, DollarSign, PieChart, UserCheck, Building2, Landmark, Receipt, CreditCard, HandCoins, BadgeDollarSign, Cog, Gauge, MapPin, FileBarChart, UserPlus, Bell, Calculator, ShieldCheck, FlaskConical, User, Plug, Database, ListTree, KeyRound, AlertTriangle, BookOpen, Wallet2, LineChart, ImageIcon, PenTool, ClipboardCheck, Sparkles, Activity, ArrowRightLeft, GitPullRequest, Trophy, PhoneCall } from 'lucide-react';

export const navGroups = [
  { label: 'Overview', icon: LayoutDashboard, path: '/', type: 'single', permKey: 'overview' },
  {
    label: 'Leads', icon: FileText, type: 'dropdown', path: '/leads', permKey: 'leads_all',
    children: [
      { label: 'Sold Leads', path: '/leads/sold', icon: CheckCircle2, permKey: 'leads_sold' },
      { label: 'Unsold Leads', path: '/leads/unsold', icon: XCircle, permKey: 'leads_unsold' },
      { label: 'Disqualified Leads', path: '/leads/disqualified', icon: Ban, permKey: 'leads_disqualified' },
      { label: 'Rejected Leads', path: '/leads/rejected', icon: Slash, permKey: 'leads_rejected' },
      { label: 'Queued Leads', path: '/leads/queued', icon: Clock, permKey: 'leads_queued' },
      { label: 'Converted Leads', path: '/leads/converted', icon: Trophy, permKey: 'leads_converted' },
    ],
  },
  {
    // Calls are CallRecords, not leads, so they get their own section rather
    // than a tab inside Leads. Gated on leads_all: anyone who can see leads
    // can see calls, which avoids inventing a permission key that no existing
    // user has stored yet.
    label: 'Calls', icon: PhoneCall, type: 'dropdown', path: '/calls', permKey: 'leads_all',
    children: [
      { label: 'All Calls', path: '/calls', icon: PhoneCall, permKey: 'leads_all' },
      { label: 'Converted Calls', path: '/calls/converted', icon: Trophy, permKey: 'leads_all' },
      { label: 'Rejected Calls', path: '/calls/rejected', icon: Slash, permKey: 'leads_all' },
    ],
  },
  {
    label: 'Reports', icon: BarChart3, type: 'dropdown', path: '/reports', permKey: 'reports',
    children: [
      { label: 'Performance Overview', path: '/reports', tab: 'performance_overview', icon: TrendingUp, permKey: 'reports' },
      { label: 'Daily Performance', path: '/reports', tab: 'daily', icon: CalendarDays, permKey: 'reports' },
      { label: 'Campaign Performance', path: '/reports', tab: 'campaign', icon: Target, permKey: 'reports' },
      { label: 'P&L', path: '/reports', tab: 'pnl', icon: DollarSign, permKey: 'reports' },
      { label: 'Ad Performance', path: '/reports', tab: 'ad', icon: PieChart, permKey: 'reports' },
      { label: 'Buyer Performance', path: '/reports', tab: 'buyer', icon: UserCheck, permKey: 'reports' },
      { label: 'Supplier Performance', path: '/reports', tab: 'supplier', icon: Building2, permKey: 'reports' },
    ],
  },
  {
    label: 'Operations', icon: SlidersHorizontal, type: 'dropdown', path: '/operations', permKey: 'operations',
    children: [
      { label: 'Dashboard', path: '/operations', icon: Gauge, permKey: 'operations' },
      { label: 'Verticals', path: '/operations/verticals', icon: Layers, permKey: 'operations' },
      { label: 'Buyers', path: '/operations/buyers', icon: Users, permKey: 'operations' },
      { label: 'Suppliers', path: '/operations/suppliers', icon: Truck, permKey: 'operations' },
      { label: 'Active States', path: '/operations/active-states', icon: MapPin, permKey: 'operations' },
      { label: 'Billing Reports', path: '/operations/billing-reports', icon: FileBarChart, permKey: 'operations' },
      { label: 'Buyer Onboarding', path: '/operations/buyer-onboarding', icon: UserPlus, permKey: 'operations' },
    ],
  },
  {
    label: 'Lead Distribution', icon: Share2, type: 'dropdown', path: '/distribution', permKey: 'dist_dashboard',
    children: [
      { label: 'Dashboard', path: '/distribution', icon: LayoutDashboard, permKey: 'dist_dashboard' },
      { label: 'Campaigns', path: '/campaigns', icon: Megaphone, permKey: 'dist_campaigns' },
      { label: 'Webhooks', path: '/deliveries', icon: Webhook, permKey: 'dist_deliveries' },
      { label: 'Conversion Events', path: '/conversion-events', icon: Zap, permKey: 'dist_conversion_events' },
    ],
  },
  {
    label: 'Finances', icon: Wallet, type: 'dropdown', path: '/finances', permKey: 'finances',
    children: [
      { label: 'Overview', path: '/finances', tab: 'overview', icon: LayoutDashboard, permKey: 'finances' },
      { label: 'Profitability', path: '/finances', tab: 'profit', icon: TrendingUp, permKey: 'bank_feed' },
      { label: 'Bank Feed', path: '/finances', tab: 'bank', icon: Landmark, permKey: 'bank_feed' },
      { label: 'Invoices', path: '/finances', tab: 'invoices', icon: Receipt, permKey: 'finances' },
      { label: 'Buyer Payments', path: '/finances', tab: 'payments', icon: CreditCard, permKey: 'finances' },
      { label: 'Supplier Payouts', path: '/finances', tab: 'payouts', icon: HandCoins, permKey: 'finances' },
      { label: 'Ad Spend', path: '/finances', tab: 'adspend', icon: BadgeDollarSign, permKey: 'finances' },
      { label: 'Settings', path: '/finances', tab: 'settings', icon: Cog, permKey: 'finances' },
    ],
  },
  {
    label: 'Ad Manager', icon: Megaphone, type: 'dropdown', path: '/ad-manager', permKey: 'ad_manager',
    children: [
      { label: 'Performance Dashboard', path: '/ad-manager', icon: LineChart, permKey: 'ad_manager' },
      { label: 'Ad Reports', path: '/ad-manager/reports', icon: FileBarChart, permKey: 'ad_manager' },
      { label: 'Creative Analyzer', path: '/ad-manager/creative-analyzer', icon: ImageIcon, permKey: 'ad_manager' },
      { label: 'Ad Builder', path: '/ad-manager/builder', icon: PenTool, permKey: 'ad_manager' },
    ],
  },
  {
    label: 'Tools', icon: Wrench, type: 'dropdown', path: '/tools', permKey: 'tools',
    children: [
      { label: 'Dashboard', path: '/tools', icon: LayoutDashboard, permKey: 'tools' },
      { label: 'Notifications', path: '/notifications', icon: Bell, permKey: 'tools' },
      { label: 'Calculated Fields', path: '/calculated-fields', icon: Calculator, permKey: 'tools' },
      { label: 'Verification', path: '/verification', icon: ShieldCheck, permKey: 'tools' },
      { label: 'Payload Tester', path: '/payload-tester', icon: FlaskConical, permKey: 'tools' },
    ],
  },
  {
    // The Progress Control Center used to render its own sidebar next to this
    // one, which meant three nav columns before the thing being reviewed. It is
    // a section like any other, so it lives here.
    label: 'Progress', icon: ClipboardCheck, type: 'dropdown', path: '/progress', permKey: 'progress_access',
    children: [
      { label: 'Command Center', path: '/progress', icon: Gauge, permKey: 'progress_access' },
      { label: 'Application Review', path: '/progress/review', icon: ListTree, permKey: 'progress_access' },
      { label: 'Findings', path: '/progress/findings', icon: AlertTriangle, permKey: 'progress_access' },
      { label: 'Change Requests', path: '/progress/changes', icon: GitPullRequest, permKey: 'progress_access' },
      { label: 'Prompt Studio', path: '/progress/prompts', icon: Sparkles, permKey: 'progress_prompts' },
      { label: 'Build Activity', path: '/progress/activity', icon: Activity, permKey: 'progress_access' },
      { label: 'LeadByte Migration', path: '/progress/migration', icon: ArrowRightLeft, permKey: 'progress_access' },
      { label: 'Release Gates', path: '/progress/gates', icon: ShieldCheck, permKey: 'progress_access' },
      { label: 'Progress Settings', path: '/progress/settings', icon: Cog, permKey: 'progress_admin' },
    ],
  },
  {
    label: 'Settings', icon: SettingsIcon, type: 'dropdown', path: '/settings',
    children: [
      // First child, and no permKey, so clicking Settings always lands on the
      // status board rather than dropping straight into the General form.
      { label: 'Dashboard', path: '/settings', tab: 'dashboard', icon: LayoutDashboard },
      { label: 'General', path: '/settings', tab: 'general', icon: Cog, permKey: 'set_integrations' },
      { label: 'Users and Roles', path: '/settings', tab: 'users', icon: User, permKey: 'set_users' },
      { label: 'Integrations', path: '/settings', tab: 'integrations', icon: Plug, permKey: 'set_integrations' },
      { label: 'Data Sources', path: '/settings', tab: 'data-sources', icon: Database, permKey: 'set_data_sources' },
      { label: 'Custom Fields', path: '/settings', tab: 'fields', icon: ListTree, permKey: 'set_custom_fields' },
      { label: 'Field Mapping', path: '/settings', tab: 'field-mapping', icon: Share2, permKey: 'set_field_mapping' },
      { label: 'API Keys', path: '/settings', tab: 'apikeys', icon: KeyRound, permKey: 'set_api_keys' },
      { label: 'Error Logs', path: '/settings', tab: 'errors', icon: AlertTriangle, permKey: 'set_error_logs' },
      { label: 'Knowledge Base', path: '/settings', tab: 'knowledge', icon: BookOpen, permKey: 'set_knowledge_base' },
      { label: 'Financial', path: '/settings', tab: 'billing', icon: Wallet2, permKey: 'set_billing' },
    ],
  },
];

// Filter groups + children down to what the current user can access.
// A dropdown whose Settings parent link (General) is hidden still opens on its first visible child.
export function filterNav(groups, can) {
  return groups
    .map(group => {
      if (group.type === 'single') {
        return group.permKey && !can(group.permKey) ? null : group;
      }
      const children = (group.children || [])
        .map(c => {
          if (c.children) {
            const grand = c.children.filter(g => !g.permKey || can(g.permKey));
            if (grand.length === 0) return c.permKey && !can(c.permKey) ? null : { ...c, children: [] };
            return { ...c, children: grand };
          }
          return c;
        })
        .filter(Boolean)
        .filter(c => !c.permKey || can(c.permKey));
      if (children.length === 0) return null;
      const next = { ...group, children };
      // If the parent has a direct path (Leads -> /leads, Settings -> /settings)
      // but the user can't access that exact target, route the parent to the first visible child.
      if (next.path) {
        if (next.permKey && !can(next.permKey)) {
          next.path = children[0].tab ? `${children[0].path}?tab=${children[0].tab}` : children[0].path;
        } else if (next.label === 'Settings') {
          next.path = children[0].tab ? `${children[0].path}?tab=${children[0].tab}` : children[0].path;
        }
      }
      return next;
    })
    .filter(Boolean);
}