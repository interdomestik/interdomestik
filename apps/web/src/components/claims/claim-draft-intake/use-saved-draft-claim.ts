'use client';

import {
  createClaimFromSavedDraft,
  lookupSavedDraftClaim,
} from '@/actions/claims/create-from-saved-draft';
import { useEffect, useRef, useState, useTransition } from 'react';

type Claim = { id: string; number: string };
type LookupStatus = 'idle' | 'checking' | 'found' | 'not_found' | 'error';
type LookupState = {
  claim: Claim | null;
  identity: string | null;
  origin: 'background_lookup' | 'user_submit' | null;
  status: LookupStatus;
};
type Options = Readonly<{
  draftId?: string | null;
  draftVersion?: number | null;
  eligible: boolean;
  failedCopy: string;
  unexpectedCopy: string;
}>;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const isSavedDraftId = (value?: string | null) => Boolean(value && UUID.test(value));

export function useSavedDraftClaim(options: Options) {
  const { draftId, draftVersion, eligible, failedCopy, unexpectedCopy } = options;
  const validId = isSavedDraftId(draftId);
  const identity = validId && draftVersion ? `${draftId!.toLowerCase()}:${draftVersion}` : null;
  const initialStatus: LookupStatus = identity ? 'checking' : 'idle';
  const [lookup, setLookup] = useState<LookupState>({
    claim: null,
    identity,
    origin: null,
    status: initialStatus,
  });
  const [failure, setFailure] = useState<{ identity: string; message: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const submitting = useRef(false);
  const current =
    lookup.identity === identity
      ? lookup
      : { claim: null, identity, origin: null, status: initialStatus };

  useEffect(() => {
    let active = true;
    if (!identity || !draftId) {
      setLookup({ claim: null, identity: null, origin: null, status: 'idle' });
      return () => {
        active = false;
      };
    }
    setLookup({ claim: null, identity, origin: null, status: 'checking' });
    setFailure(null);
    lookupSavedDraftClaim({ id: draftId })
      .then(result => {
        if (!active) return;
        setLookup({
          claim: result.claim,
          identity,
          origin: result.claim ? 'background_lookup' : null,
          status: result.claim ? 'found' : 'not_found',
        });
      })
      .catch(() => {
        if (active) setLookup({ claim: null, identity, origin: null, status: 'error' });
      });
    return () => {
      active = false;
    };
  }, [draftId, identity]);

  function submit() {
    if (!eligible || !draftId || !draftVersion || !identity || submitting.current) return;
    if (current.status === 'checking' || current.status === 'found') return;
    submitting.current = true;
    setFailure(null);
    startTransition(async () => {
      try {
        const result = await createClaimFromSavedDraft({
          id: draftId,
          expectedVersion: draftVersion,
        });
        if (result.success) {
          setLookup({
            claim: { id: result.claimId, number: result.claimNumber },
            identity,
            origin: 'user_submit',
            status: 'found',
          });
        } else setFailure({ identity, message: failedCopy });
      } catch {
        setFailure({ identity, message: unexpectedCopy });
      } finally {
        submitting.current = false;
      }
    });
  }

  return {
    claim: current.claim,
    failure: failure?.identity === identity ? failure.message : null,
    lookupStatus: current.status,
    origin: current.origin,
    pending,
    submit,
  };
}
