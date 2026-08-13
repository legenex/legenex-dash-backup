import { useSearchParams } from 'react-router-dom';
import { usePermissions, useAuth } from '@/lib/AuthContext';

// Resolves the supplier scope + preview state for the supplier portal.
// - A real supplier user is scoped to their linked_supplier_id.
// - An operator (owner/admin) can preview a supplier by passing ?supplier_id= in the URL.
export function useSupplierPortalScope() {
  const { user } = useAuth();
  const { realRole, role } = usePermissions();
  const [params] = useSearchParams();

  const isOperator = realRole === 'owner' || realRole === 'admin';
  const requestedSupplierId = params.get('supplier_id');

  // Operator using "View as → Supplier" (effective role flipped, no explicit target).
  const rolePreview = isOperator && role === 'supplier' && !requestedSupplierId;

  // Operators previewing pass supplier_id; suppliers are scoped server-side by their account.
  const previewSupplierId = isOperator ? requestedSupplierId : null;
  const supplierId = previewSupplierId || user?.linked_supplier_id || null;

  return {
    supplierId,
    previewing: !!previewSupplierId || rolePreview,
    isOperator,
    previewSupplierId,
    rolePreview,
  };
}