import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import SupplierPortalSidebar from './SupplierPortalSidebar';
import SupplierPreviewBanner from './SupplierPreviewBanner';
import { useSupplierPortalScope } from '@/hooks/useSupplierPortalScope';
import { useSupplierPortalData } from '@/hooks/useSupplierPortalData';

// Supplier portal shell. Own minimal sidebar, scoped data, never exposes operator sections.
// Access: supplier-role users scoped to their supplier, or operators previewing via ?supplier_id=.
export default function SupplierPortalLayout() {
  const { supplierId, isOperator, rolePreview } = useSupplierPortalScope();
  const { data, isLoading, error } = useSupplierPortalData();

  // No supplier scope at all → not allowed here. During "View as → Supplier"
  // role preview the supplier is resolved server-side, so don't bounce on a null id.
  if (!supplierId && !rolePreview && !isLoading) {
    return <Navigate to="/" replace />;
  }

  const supplier = data?.supplier;

  return (
    <div className="h-screen flex bg-background">
      <SupplierPortalSidebar />
      <main className="flex-1 ml-[248px] overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-8 py-8">
          <SupplierPreviewBanner supplierName={supplier?.name} />
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-card border border-border rounded-[10px] p-8 text-center">
              <p className="text-[14px] font-semibold text-foreground">Portal unavailable</p>
              <p className="text-[13px] text-muted-foreground mt-1">
                {error?.response?.data?.error || 'This supplier portal is not enabled or no supplier is linked to your account.'}
              </p>
            </div>
          ) : (
            <Outlet context={{ data, supplier }} />
          )}
        </div>
      </main>
    </div>
  );
}