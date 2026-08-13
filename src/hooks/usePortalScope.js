import { useSearchParams } from 'react-router-dom';
import { usePermissions, useAuth } from '@/lib/AuthContext';

// Resolves the buyer scope + preview state for the buyer portal.
// - A real buyer user is scoped to their linked_buyer_id.
// - An operator (owner/admin) can preview a buyer by passing ?buyer_id= in the URL.
export function usePortalScope() {
  const { user } = useAuth();
  const { realRole, role } = usePermissions();
  const [params] = useSearchParams();

  const isOperator = realRole === 'owner' || realRole === 'admin';
  const requestedBuyerId = params.get('buyer_id');

  // Operator using "View as → Buyer" (effective role flipped, no explicit target).
  const rolePreview = isOperator && role === 'buyer' && !requestedBuyerId;

  // Operators previewing pass buyer_id; buyers are scoped server-side by their account.
  const previewBuyerId = isOperator ? requestedBuyerId : null;
  const buyerId = previewBuyerId || user?.linked_buyer_id || null;

  return {
    buyerId,
    previewing: !!previewBuyerId || rolePreview,
    isOperator,
    previewBuyerId,
    rolePreview,
  };
}