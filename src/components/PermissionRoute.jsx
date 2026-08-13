import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { usePermissions } from '@/lib/AuthContext';
import { keyForLocation, firstAllowedPath } from '@/lib/permissions';

// Wraps the protected routes and blocks direct access to any path the current
// user lacks the matching permission key for, redirecting to their first allowed page.
export default function PermissionRoute() {
  const location = useLocation();
  const { can, role } = usePermissions();

  // Buyer / Supplier roles (real OR previewed via "View as") never see the
  // operator app. They live entirely inside their own portal, which has its
  // own scoped sidebar (Overview / Leads / Reports) and trimmed report set.
  // Redirect any operator route into the matching portal root.
  if (role === 'buyer') {
    return <Navigate to="/portal" replace />;
  }
  if (role === 'supplier') {
    return <Navigate to="/supplier-portal" replace />;
  }

  const key = keyForLocation(location.pathname, location.search);

  // Paths with no gating key (e.g. queue recovery aliases already covered) render freely.
  if (key && !can(key)) {
    const dest = firstAllowedPath(can);
    if (dest && dest !== location.pathname + location.search) {
      return <Navigate to={dest} replace />;
    }
    // No accessible page at all, show a minimal notice rather than a blank redirect loop.
    if (!dest) {
      return (
        <div className="flex-1 flex items-center justify-center py-24">
          <div className="text-center">
            <p className="text-[15px] font-semibold text-foreground">No access</p>
            <p className="text-[13px] text-muted-foreground mt-1">Your account doesn't have access to any section. Contact an administrator.</p>
          </div>
        </div>
      );
    }
  }

  return <Outlet />;
}