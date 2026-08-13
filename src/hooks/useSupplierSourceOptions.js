import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { base44 } from '@/api/base44Client';
import { buildSupplierSourceOptions } from '@/lib/supplierSourceOptions';

// One hook for every surface that needs to offer a sid or an ssid.
//
// Supplier sources are created in Operations under a supplier and they ARE the
// ssid values. Any screen that lets an operator type one instead of picking it
// can silently attribute traffic to a supplier that does not exist, so this is
// the single place those options come from.
export function useSupplierSourceOptions() {
  const { data: suppliers = [], isLoading: loadingSuppliers } = useQuery({
    queryKey: ['suppliers-all-for-options'],
    queryFn: async () => (await base44.entities.Supplier.list('-created_date', 500)) || [],
    staleTime: 60_000,
  });

  const { data: sources = [], isLoading: loadingSources } = useQuery({
    queryKey: ['supplier-sources-for-options'],
    queryFn: async () => (await base44.entities.SupplierSource.list('-created_date', 500)) || [],
    staleTime: 60_000,
  });

  const { options, index } = useMemo(
    () => buildSupplierSourceOptions(suppliers, sources),
    [suppliers, sources],
  );

  return { options, index, suppliers, sources, isLoading: loadingSuppliers || loadingSources };
}

export default useSupplierSourceOptions;
