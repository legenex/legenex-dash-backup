import React from 'react';
import { Outlet, Navigate } from 'react-router-dom';
import PortalSidebar from './PortalSidebar';
import PreviewBanner from './PreviewBanner';
import { usePortalScope } from '@/hooks/usePortalScope';
import { usePortalData } from '@/hooks/usePortalData';

// Buyer portal shell. Own minimal sidebar, scoped data, never exposes operator sections.
// Access: buyer-role users scoped to their buyer, or operators previewing via ?buyer_id=.
export default function PortalLayout() {
  const { buyerId, isOperator, rolePreview } = usePortalScope();
  const { data, isLoading, error } = usePortalData();

  // No buyer scope at all → not allowed here. During "View as → Buyer" role
  // preview the buyer is resolved server-side, so don't bounce on a null id.
  if (!buyerId && !rolePreview && !isLoading) {
    return <Navigate to="/" replace />;
  }

  const buyer = data?.buyer;

  return (
    <div className="h-screen flex bg-background">
      <PortalSidebar />
      <main className="flex-1 ml-[248px] overflow-y-auto">
        <div className="max-w-[1200px] mx-auto px-8 py-8">
          <PreviewBanner buyerName={buyer?.company_name} />
          {isLoading ? (
            <div className="flex items-center justify-center py-24">
              <div className="w-6 h-6 border-2 border-primary/20 border-t-primary rounded-full animate-spin" />
            </div>
          ) : error ? (
            <div className="bg-card border border-border rounded-[10px] p-8 text-center">
              <p className="text-[14px] font-semibold text-foreground">Portal unavailable</p>
              <p className="text-[13px] text-muted-foreground mt-1">
                {error?.response?.data?.error || 'This buyer portal is not enabled or no buyer is linked to your account.'}
              </p>
            </div>
          ) : (
            <Outlet context={{ data, buyer }} />
          )}
        </div>
      </main>
    </div>
  );
}