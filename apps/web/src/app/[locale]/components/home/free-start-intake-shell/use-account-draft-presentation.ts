'use client';

import { getFreeStartDraftAccount } from '@/actions/free-start-drafts';
import { useEffect, useRef, useState } from 'react';
import { accountKey, receiptMatches, type DraftAccount } from './draft-lifecycle-editor';
import type { DraftQueueContext } from './account-draft-write-queue';

/** A client hint pins the editor; only the fresh server verdict enables account autosave. */
export function useAccountDraftPresentation(
  hint: DraftQueueContext | null,
  initial?: DraftAccount | null
): DraftAccount | null {
  const key = hint ? JSON.stringify([hint.ownerUserId, hint.tenantId]) : '';
  const generation = useRef(0);
  const [resolved, setResolved] = useState<{ key: string; account: DraftAccount | null }>(() => ({
    key: accountKey(initial),
    account: initial ?? null,
  }));
  useEffect(() => {
    const current = ++generation.current;
    if (!hint)
      return () => {
        generation.current++;
      };
    const expected = { ...hint };
    void getFreeStartDraftAccount()
      .then(result => {
        if (generation.current !== current) return;
        const account =
          result.ok &&
          typeof result.emailVerified === 'boolean' &&
          receiptMatches(result.expectedContext, expected)
            ? { emailVerified: result.emailVerified, expectedContext: expected }
            : { emailVerified: false, expectedContext: expected };
        setResolved({ key, account });
      })
      .catch(() => {
        if (generation.current === current)
          setResolved({ key, account: { emailVerified: false, expectedContext: expected } });
      });
    return () => {
      generation.current++;
    };
  }, [key]);
  if (!hint) return null;
  return resolved.key === key && resolved.account
    ? resolved.account
    : { emailVerified: false, expectedContext: { ...hint } };
}
