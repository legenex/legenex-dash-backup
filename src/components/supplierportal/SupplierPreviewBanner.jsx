import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { useSupplierPortalScope } from '@/hooks/useSupplierPortalScope';
import { useAuth } from '@/lib/AuthContext';

// Shown when an operator is viewing the portal as a supplier (preview mode).
export default function SupplierPreviewBanner({ supplierName }) {
  const navigate = useNavigate();
  const { setPreviewRole } = useAuth();
  const { previewing, previewSupplierId, rolePreview } = useSupplierPortalScope();
  if (!previewing) return null;

  const exit = () => {
    // Role preview ("View as → Supplier"): clear the role to return to the operator app.
    if (rolePreview) {
      setPreviewRole(null);
      navigate('/');
    } else {
      navigate(`/suppliers/${previewSupplierId}`);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-primary/15 border border-primary/30 rounded-lg px-4 py-2.5 mb-5">
      <div className="flex items-center gap-2 text-[13px] text-foreground">
        <Eye className="w-4 h-4 text-primary" />
        <span>Preview Mode, viewing the portal as <span className="font-semibold">{supplierName || 'this supplier'}</span>.</span>
      </div>
      <button
        onClick={exit}
        className="flex items-center gap-1 text-[12px] text-primary hover:underline shrink-0"
      >
        <X className="w-3.5 h-3.5" /> Exit preview
      </button>
    </div>
  );
}