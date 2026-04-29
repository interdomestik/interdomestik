'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

const PENDING_FEEDBACK_TIMEOUT_MS = 10_000;

export function useAdminUsersPendingValue<TPendingValue extends string>(resetSignature: string) {
  const [pendingValue, setPendingValue] = useState<TPendingValue | null>(null);
  const pendingValueRef = useRef<TPendingValue | null>(null);

  const updatePendingValue = useCallback((nextPendingValue: TPendingValue | null) => {
    pendingValueRef.current = nextPendingValue;
    setPendingValue(nextPendingValue);
  }, []);

  useEffect(() => {
    updatePendingValue(null);
  }, [resetSignature, updatePendingValue]);

  useEffect(() => {
    if (!pendingValue) {
      return undefined;
    }

    const timeout = globalThis.setTimeout(
      () => updatePendingValue(null),
      PENDING_FEEDBACK_TIMEOUT_MS
    );
    return () => globalThis.clearTimeout(timeout);
  }, [pendingValue, updatePendingValue]);

  return {
    hasPendingValue: Boolean(pendingValue),
    pendingValue,
    pendingValueRef,
    updatePendingValue,
  };
}
