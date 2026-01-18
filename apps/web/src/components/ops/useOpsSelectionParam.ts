'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useCallback } from 'react';

interface OpsSelectionOptions {
  paramName?: string;
  shallow?: boolean; // Note: Next.js 13+ router.replace defaults to server roundtrip unless scroll: false or similar, but query params updates are usually client-side transitions.
}

export function useOpsSelectionParam(options?: OpsSelectionOptions) {
  const paramName = options?.paramName ?? 'selected';
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const selectedId = searchParams.get(paramName);

  const setSelectedId = useCallback(
    (id: string | null) => {
      const params = new URLSearchParams(searchParams);
      if (id) {
        params.set(paramName, id);
      } else {
        params.delete(paramName);
      }
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [pathname, router, searchParams, paramName]
  );

  const clearSelectedId = useCallback(() => {
    setSelectedId(null);
  }, [setSelectedId]);

  return {
    selectedId,
    setSelectedId,
    clearSelectedId,
  };
}
