import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, X } from 'lucide-react';
import { usePortalScope } from '@/hooks/usePortalScope';
import { useAuth } from '@/lib/AuthContext';

// Shown when an operator is viewing the portal as a buyer (preview mode).
export default function PreviewBanner({ buyerName }) {
  const navigate = useNavigate();
  const { setPreviewRole } = useAuth();
  const { previewing, previewBuyerId, rolePreview } = usePortalScope();
  if (!previewing) return null;

  const exit = () => {
    // Role preview ("View as → Buyer"): clear the role so we return to the operator app.
    if (rolePreview) {
      setPreviewRole(null);
      navigate('/');
    } else {
      navigate(`/buyers/${previewBuyerId}`);
    }
  };

  return (
    <div className="flex items-center justify-between gap-3 bg-primary/15 border border-primary/30 rounded-lg px-4 py-2.5 mb-5">
      <div className="flex items-center gap-2 text-[13px] text-foreground">
        <Eye className="w-4 h-4 text-primary" />
        <span>Preview Mode, viewing the portal as <span className="font-semibold">{buyerName || 'this buyer'}</span>. Actions are live.</span>
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