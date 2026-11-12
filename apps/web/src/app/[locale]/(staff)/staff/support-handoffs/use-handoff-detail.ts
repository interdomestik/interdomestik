'use client';

import { getSupportHandoffDetail } from '@/actions/support-handoffs/detail';
import { updateSupportHandoffPublicResponse } from '@/actions/support-handoffs/response';
import type { SupportHandoffStaffDetail } from '@interdomestik/domain-claims/support-handoffs/types';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { SUPPORT_HANDOFF_ATTENTION_RESOLVED_EVENT } from './support-handoff-attention-row';

export function useHandoffDetail(handoffId: string, unavailable: string) {
  const [detail, setDetail] = useState<SupportHandoffStaffDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isResponsePending, startResponseTransition] = useTransition();
  const router = useRouter();
  const readGeneration = useRef(0);
  useEffect(
    () => () => {
      readGeneration.current += 1;
    },
    []
  );

  async function readDetail(): Promise<boolean> {
    const generation = ++readGeneration.current;
    setError(null);
    try {
      const result = await getSupportHandoffDetail(handoffId);
      if (generation !== readGeneration.current) return false;
      if (!result || 'kind' in result) {
        setError(unavailable);
        return false;
      }
      setDetail(result);
      return true;
    } catch {
      if (generation !== readGeneration.current) return false;
      setError(unavailable);
      return false;
    }
  }

  function retryDetail(): void {
    startTransition(async () => {
      await readDetail();
    });
  }

  function submitPublicResponse(formData: FormData): void {
    setError(null);
    startResponseTransition(async () => {
      try {
        await updateSupportHandoffPublicResponse(formData);
        if (!(await readDetail())) return;
        router.refresh();
        globalThis.dispatchEvent(
          new CustomEvent(SUPPORT_HANDOFF_ATTENTION_RESOLVED_EVENT, {
            detail: { handoffId },
          })
        );
      } catch {
        // An ambiguous write is never automatically replayed. Retry only reloads detail.
        setError(unavailable);
      }
    });
  }

  return { detail, error, isPending, isResponsePending, retryDetail, submitPublicResponse };
}
