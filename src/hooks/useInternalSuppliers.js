import { useQuery } from '@tanstack/react-query';
import { useEffect } from 'react';
import { base44 } from '@/api/base44Client';
import { registerInternalSuppliers } from '@/lib/reportMetrics';

// Loads the Supplier list once and registers which of them are Internal.
//
// Internal suppliers (LeadFlow, Legenex) cost ad spend and never a per-lead
// price, so their leads must not contribute lead cost even when a cpl value
// rides along on the payload. leadCost consults the registered set by default,
// which keeps every surface consistent without threading a parameter through
// every metric function.
//
// Mounted high in the tree so it applies everywhere rather than per page.
export default function useInternalSuppliers() {
  const { data: suppliers } = useQuery({
    queryKey: ['suppliers'],
    queryFn: () => base44.entities.Supplier.list(),
    staleTime: 5 * 60 * 1000,
  });

  useEffect(() => {
    if (Array.isArray(suppliers)) registerInternalSuppliers(suppliers);
  }, [suppliers]);
}
