// The operator route table, extracted from App.jsx so there is exactly one of it.
//
// Two things render this: the live application, and the Progress Control Center's
// offscreen screenshot capturer. The capturer needs the FULL shell (sidebar,
// section sub-nav, layout chrome) because those are things Nick reviews and
// comments on, and a bare page component is not what anyone actually looks at.
//
// Duplicating the table would guarantee drift, and a screenshot of a route table
// that no longer matches the app is worse than no screenshot.

import { Toaster } from "@/components/ui/toaster"
import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, Navigate, useParams, useSearchParams } from 'react-router-dom';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider, useAuth } from '@/lib/AuthContext';
import UserNotRegisteredError from '@/components/UserNotRegisteredError';
import ProtectedRoute from '@/components/ProtectedRoute';
import PermissionRoute from '@/components/PermissionRoute';
import ScrollToTop from './components/ScrollToTop';
import { hostScope, isAllowedOnProgressHost } from '@/lib/hostScope';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';
import ApiStatus from '@/pages/ApiStatus';
import Apply from '@/pages/Apply';
import DocsLayout from '@/components/docs/DocsLayout';
import { DOCS_ROUTES } from '@/components/docs/docsConfig';
import AppLayout from '@/components/layout/AppLayout';
import DistributionLayout from '@/components/distribution/DistributionLayout';
import LeadsLayout from '@/components/leads/LeadsLayout';
import CallsLayout from '@/components/calls/CallsLayout';
import CallsView from '@/pages/CallsView';
import FinancesLayout from '@/components/finances/FinancesLayout';
import OperationsLayout from '@/components/operations/OperationsLayout';
import AdManagerLayout from '@/components/admanager/AdManagerLayout';
import ToolsLayout from '@/components/tools/ToolsLayout';
import Overview from '@/pages/Overview';
import DistributionDashboard from '@/pages/DistributionDashboard';
import LeadsView from '@/pages/LeadsView';
import QueueRecovery from '@/pages/QueueRecovery';
import Campaigns from '@/pages/Campaigns';
import SupplierDetail from '@/pages/SupplierDetail';
import BuyerDetail from '@/pages/BuyerDetail';
import Reports from '@/pages/Reports';
import Finances from '@/pages/Finances';
import Deliveries from '@/pages/Deliveries';
import ConversionEvents from '@/pages/ConversionEvents';
import RouteSimulator from '@/pages/RouteSimulator';
import RouteGroups from '@/pages/RouteGroups';
import Notifications from '@/pages/Notifications';
import Verification from '@/pages/Verification';
import Settings from '@/pages/Settings';
import CustomCalculations from '@/pages/CustomCalculations';
import OperationsBuyers from '@/pages/operations/OperationsBuyers';
import OperationsSuppliers from '@/pages/operations/OperationsSuppliers';
import OperationsActiveStates from '@/pages/operations/OperationsActiveStates';
import OperationsVerticals from '@/pages/operations/OperationsVerticals';
import OperationsBillingReports from '@/pages/operations/OperationsBillingReports';
import OperationsBuyerOnboarding from '@/pages/operations/OperationsBuyerOnboarding';
import OperationsDashboard from '@/pages/operations/OperationsDashboard';
import AdPerformanceDashboard from '@/pages/admanager/AdPerformanceDashboard';
import AdReports from '@/pages/admanager/AdReports';
import CreativeAnalyzer from '@/pages/admanager/CreativeAnalyzer';
import AdBuilder from '@/pages/admanager/AdBuilder';
import PayloadTester from '@/pages/PayloadTester';
import ToolsDashboard from '@/pages/ToolsDashboard';
import ProgressLayout from '@/components/progress/ProgressLayout';
import CommandCenter from '@/pages/progress/CommandCenter';
import ApplicationReview from '@/pages/progress/ApplicationReview';
import Migration from '@/pages/progress/Migration';
import Gates from '@/pages/progress/Gates';
import Findings from '@/pages/progress/Findings';
import ChangeRequests from '@/pages/progress/ChangeRequests';
import PromptStudio from '@/pages/progress/PromptStudio';
import BuildActivity from '@/pages/progress/BuildActivity';
import ProgressSettings from '@/pages/progress/ProgressSettings';
import PortalLayout from '@/components/portal/PortalLayout';
import PortalDashboard from '@/pages/portal/PortalDashboard';
import PortalLeads from '@/pages/portal/PortalLeads';
import PortalReports from '@/pages/portal/PortalReports';
import PortalReturns from '@/pages/portal/PortalReturns';
import PortalSettings from '@/pages/portal/PortalSettings';
import SupplierPortalLayout from '@/components/supplierportal/SupplierPortalLayout';
import SupplierPortalDashboard from '@/pages/supplierportal/SupplierPortalDashboard';
import SupplierPortalLeads from '@/pages/supplierportal/SupplierPortalLeads';
import SupplierPortalReports from '@/pages/supplierportal/SupplierPortalReports';
import SupplierPortalReturns from '@/pages/supplierportal/SupplierPortalReturns';
import SupplierPortalApi from '@/pages/supplierportal/SupplierPortalApi';
import SupplierPortalSettings from '@/pages/supplierportal/SupplierPortalSettings';

function LegacySupplierRedirect() {
  const { id } = useParams();
  const [params] = useSearchParams();
  if (params.get('legacy') === '1') return <SupplierDetail />;
  const tab = params.get('tab');
  const qs = new URLSearchParams({ supplier: id || '' });
  if (tab) qs.set('tab', tab);
  return <Navigate to={`/operations/suppliers?${qs.toString()}`} replace />;
}

// Same handoff for buyers. The old /buyers/:id page duplicated the Operations
// buyer detail; Operations is the surface that is maintained, so old links go
// there with their tab preserved.
function LegacyBuyerRedirect() {
  const { id } = useParams();
  const [params] = useSearchParams();
  if (params.get('legacy') === '1') return <BuyerDetail />;
  const tab = params.get('tab');
  const qs = new URLSearchParams({ buyer: id || '' });
  if (tab) qs.set('tab', tab);
  return <Navigate to={`/operations/buyers?${qs.toString()}`} replace />;
}

// Public documentation routes, rendered with no auth. Reused both on the
// docs subdomain (as the entire app) and under /docs on the main app.

export const DocsRoutes = () => (
  <Route path="/docs" element={<DocsLayout />}>
    {DOCS_ROUTES.map((r) => (
      <Route
        key={r.slug || 'index'}
        {...(r.slug ? { path: r.slug } : { index: true })}
        element={<r.Component />}
      />
    ))}
  </Route>
);

export const ProgressRoutes = () => (
  <Route element={<ProgressLayout />}>
    <Route path="/progress" element={<CommandCenter />} />
    <Route path="/progress/review" element={<ApplicationReview />} />
    <Route path="/progress/migration" element={<Migration />} />
    <Route path="/progress/gates" element={<Gates />} />
    <Route path="/progress/findings" element={<Findings />} />
    <Route path="/progress/changes" element={<ChangeRequests />} />
    <Route path="/progress/prompts" element={<PromptStudio />} />
    <Route path="/progress/activity" element={<BuildActivity />} />
    <Route path="/progress/settings" element={<ProgressSettings />} />
  </Route>
);

export function OperatorRoutes() {
  return (
    <>
      <Route path="/login" element={<Login />} />
      <Route path="/register" element={<Register />} />
      <Route path="/forgot-password" element={<ForgotPassword />} />
      <Route path="/reset-password" element={<ResetPassword />} />

      {/* Public documentation, no auth, outside ProtectedRoute and AppLayout */}
      {DocsRoutes()}

      {/* Public buyer onboarding, no auth, outside ProtectedRoute and AppLayout */}
      <Route path="/apply" element={<Apply />} />

      <Route element={<ProtectedRoute unauthenticatedElement={<Navigate to="/login" replace />} />}>
        {/* Buyer portal: separate shell, its own sidebar, buyer-scoped. Not wrapped by the operator AppLayout. */}
        <Route element={<PortalLayout />}>
          <Route path="/portal" element={<PortalDashboard />} />
          <Route path="/portal/leads" element={<PortalLeads />} />
          <Route path="/portal/reports" element={<PortalReports />} />
          <Route path="/portal/returns" element={<PortalReturns />} />
          <Route path="/portal/settings" element={<PortalSettings />} />
        </Route>
        {/* Supplier (Source) portal: separate shell, supplier-scoped. Not wrapped by the operator AppLayout. */}
        <Route element={<SupplierPortalLayout />}>
          <Route path="/supplier-portal" element={<SupplierPortalDashboard />} />
          <Route path="/supplier-portal/leads" element={<SupplierPortalLeads />} />
          <Route path="/supplier-portal/reports" element={<SupplierPortalReports />} />
          <Route path="/supplier-portal/returns" element={<SupplierPortalReturns />} />
          <Route path="/supplier-portal/api" element={<SupplierPortalApi />} />
          <Route path="/supplier-portal/settings" element={<SupplierPortalSettings />} />
        </Route>
        <Route element={<AppLayout />}>
          <Route element={<PermissionRoute />}>
          <Route path="/" element={<Overview />} />
          <Route element={<LeadsLayout />}>
            <Route path="/leads" element={<LeadsView view="all" />} />
            <Route path="/leads/sold" element={<LeadsView view="sold" />} />
            <Route path="/leads/unsold" element={<LeadsView view="unsold" />} />
            <Route path="/leads/disqualified" element={<LeadsView view="disqualified" />} />
            <Route path="/leads/rejected" element={<LeadsView view="rejected" />} />
            <Route path="/leads/queued" element={<LeadsView view="queued" />} />
            <Route path="/leads/converted" element={<LeadsView view="converted" />} />
          </Route>
          <Route path="/leads/rejections" element={<Navigate to="/leads/rejected" replace />} />
          {/* Calls moved out of the Leads section into their own top-level
              section. The old path stays as a redirect so bookmarks survive. */}
          <Route path="/leads/calls" element={<Navigate to="/calls" replace />} />
          <Route element={<CallsLayout />}>
            <Route path="/calls" element={<CallsView view="all" />} />
            <Route path="/calls/converted" element={<CallsView view="converted" />} />
            <Route path="/calls/rejected" element={<CallsView view="rejected" />} />
          </Route>
          <Route path="/queue-recovery" element={<QueueRecovery />} />
          <Route path="/errors" element={<Navigate to="/settings?tab=errors" replace />} />
          <Route element={<DistributionLayout />}>
            <Route path="/distribution" element={<DistributionDashboard />} />
            <Route path="/campaigns" element={<Campaigns />} />
            {/* Buyers live in Operations only. These paths are kept as redirects so
                existing bookmarks and cross-links do not 404. */}
            <Route path="/distribution/buyers" element={<Navigate to="/operations/buyers" replace />} />
            <Route path="/distribution/buyers/:id" element={<Navigate to="/operations/buyers" replace />} />
            <Route path="/campaigns/deliveries" element={<Navigate to="/campaigns" replace />} />
            {/* Nick's live rename: /deliveries stays and renders the Webhooks page. */}
            <Route path="/deliveries" element={<Deliveries />} />
            <Route path="/conversion-events" element={<ConversionEvents />} />
            {/* Route Groups (Advanced) + Simulator stay routable, out of nav. */}
            <Route path="/distribution/routes" element={<RouteGroups />} />
            <Route path="/distribution/simulator" element={<RouteSimulator />} />
          </Route>
          {/* Suppliers and buyers are managed inside Operations. The old
              standalone detail pages are kept mounted only behind ?legacy=1 so
              nothing breaks if a bookmark or an old link is still in use; the
              default is to hand off to the Operations surface, which now holds
              the full tab set (Overview, Sources, Ad Spend, Posting Specs,
              Portal, Leads). */}
          <Route path="/suppliers/:id" element={<LegacySupplierRedirect />} />
          <Route path="/buyers/:id" element={<LegacyBuyerRedirect />} />
          <Route path="/buyers" element={<Navigate to="/campaigns?tab=buyers" replace />} />
          <Route path="/suppliers" element={<Navigate to="/campaigns?tab=suppliers" replace />} />
          <Route path="/reports" element={<Reports />} />
          <Route element={<FinancesLayout />}>
            <Route path="/finances" element={<Finances />} />
          </Route>
          <Route element={<OperationsLayout />}>
            <Route path="/operations" element={<OperationsDashboard />} />
            <Route path="/operations/buyers" element={<OperationsBuyers />} />
            <Route path="/operations/suppliers" element={<OperationsSuppliers />} />
            <Route path="/operations/verticals" element={<OperationsVerticals />} />
            <Route path="/operations/active-states" element={<OperationsActiveStates />} />
            <Route path="/operations/billing-reports" element={<OperationsBillingReports />} />
            <Route path="/operations/buyer-onboarding" element={<OperationsBuyerOnboarding />} />
          </Route>
          <Route element={<AdManagerLayout />}>
            <Route path="/ad-manager" element={<AdPerformanceDashboard />} />
            <Route path="/ad-manager/reports" element={<AdReports />} />
            <Route path="/ad-manager/creative-analyzer" element={<CreativeAnalyzer />} />
            <Route path="/ad-manager/builder" element={<AdBuilder />} />
          </Route>
          <Route path="/lead-distribution" element={<Navigate to="/campaigns" replace />} />
          <Route element={<ToolsLayout />}>
            <Route path="/tools" element={<ToolsDashboard />} />
            <Route path="/notifications" element={<Notifications />} />
            <Route path="/verification" element={<Verification />} />
            <Route path="/calculated-fields" element={<CustomCalculations />} />
            <Route path="/payload-tester" element={<PayloadTester />} />
          </Route>
          <Route path="/settings" element={<Settings />} />
          {/* Progress Control Center on the main dashboard host. Gated by the
              progress permission keys through PermissionRoute like every other
              operator route. */}
          {ProgressRoutes()}
          </Route>
        </Route>
      </Route>

      <Route path="*" element={<PageNotFound />} />
    </>
  );
}
