'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

import {
  ANONYMOUS_DRAFT_KEY,
  createAnonymousDraftSnapshot,
  getAnonymousDraftStorage,
  readAnonymousDraft,
  removeAnonymousDraft,
  writeAnonymousDraft,
  type AnonymousDraftRecord,
  type AnonymousDraftSnapshot,
} from './anonymous-draft-recovery';
import type { CategoryId, DraftSaveState, DraftState, StepId } from './types';

type RecoveryState =
  'idle' | 'saved' | 'offer' | 'conflict' | 'unavailable' | 'discarded' | 'secure';
// prettier-ignore
type Args = Readonly<{ activeId: string | null; category: CategoryId | null; draft: DraftState; lifecycleState: DraftSaveState; neutralHost?: string | null; onReset: () => void; onRestore: (draft: AnonymousDraftSnapshot) => void; resetCategory: CategoryId | null; step: StepId }>;

// prettier-ignore
function isNeutralRecoveryHost(configured?: string | null) { return typeof globalThis.location !== 'undefined' && (['ida.interdomestik.com', 'ida.localhost', 'ida.127.0.0.1.nip.io'].includes(globalThis.location.hostname) || Boolean(configured && globalThis.location.host.toLowerCase() === configured)); }

export function useAnonymousDraftRecovery(args: Args) {
  const [enabled, setEnabled] = useState(false);
  const [offer, setOffer] = useState<AnonymousDraftRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<RecoveryState>('idle');
  const invalidated = useRef(false);
  const knownUpdatedAt = useRef<string | null>(null);
  const skipWrite = useRef(false);
  const previousLifecycleState = useRef(args.lifecycleState);
  const fingerprint = JSON.stringify([args.category, args.draft, args.step]);
  // prettier-ignore
  const markUnavailable = useCallback(() => { setEnabled(false); setOffer(null); setState('unavailable'); }, []);

  useEffect(() => {
    // prettier-ignore
    if (!isNeutralRecoveryHost(args.neutralHost)) { setEnabled(false); setOffer(null); setState('idle'); return; }
    const result = readAnonymousDraft(getAnonymousDraftStorage());
    setEnabled(result.status !== 'unavailable');
    if (result.status === 'available') {
      knownUpdatedAt.current = result.record.updatedAt;
      setOffer(result.record);
      setState('offer');
    } else if (result.status === 'unavailable') {
      markUnavailable();
    }
    setReady(true);
  }, [args.neutralHost, markUnavailable]);

  useEffect(() => {
    if (!isNeutralRecoveryHost(args.neutralHost)) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANONYMOUS_DRAFT_KEY) return;
      const result = readAnonymousDraft(getAnonymousDraftStorage());
      // prettier-ignore
      if (result.status === 'unavailable') { markUnavailable(); return; }
      setEnabled(true);
      if (result.status === 'none') {
        invalidated.current = true;
        knownUpdatedAt.current = null;
        setOffer(null);
        setState('discarded');
        return;
      }
      if (result.status === 'available' && result.record.updatedAt !== knownUpdatedAt.current) {
        invalidated.current = false;
        knownUpdatedAt.current = result.record.updatedAt;
        setOffer(result.record);
        setState('conflict');
      }
    };
    globalThis.addEventListener('storage', onStorage);
    return () => globalThis.removeEventListener('storage', onStorage);
  }, [args.neutralHost, markUnavailable]);

  useEffect(() => {
    if (!isNeutralRecoveryHost(args.neutralHost) || !enabled || invalidated.current) return;
    if (!ready || offer || !args.category) return;
    // prettier-ignore
    if (skipWrite.current) { skipWrite.current = false; return; }
    const snapshot = createAnonymousDraftSnapshot(args.category, args.draft, args.step);
    if (!snapshot) return;
    // prettier-ignore
    const result = writeAnonymousDraft(getAnonymousDraftStorage(), snapshot, knownUpdatedAt.current);
    if (result.status === 'saved') {
      knownUpdatedAt.current = result.updatedAt;
      setState('saved');
    } else if (result.status === 'conflict') {
      knownUpdatedAt.current = result.record.updatedAt;
      setOffer(result.record);
      setState('conflict');
    } else if (result.status === 'stale') {
      invalidated.current = true;
      setState('discarded');
    } else {
      markUnavailable();
    }
  }, [args.category, args.neutralHost, enabled, fingerprint, markUnavailable, offer, ready]);

  useEffect(() => {
    if (!isNeutralRecoveryHost(args.neutralHost)) return;
    const previous = previousLifecycleState.current;
    previousLifecycleState.current = args.lifecycleState;
    if (previous !== 'saving' || args.lifecycleState !== 'saved' || !args.activeId) return;
    // prettier-ignore
    if (!removeAnonymousDraft(getAnonymousDraftStorage())) { markUnavailable(); return; }
    knownUpdatedAt.current = null;
    setOffer(null);
    setState('secure');
  }, [args.activeId, args.lifecycleState, args.neutralHost, markUnavailable]);

  const clearDeviceCopy = useCallback(() => {
    if (!isNeutralRecoveryHost(args.neutralHost)) return false;
    const removed = removeAnonymousDraft(getAnonymousDraftStorage());
    if (removed) {
      knownUpdatedAt.current = null;
      setOffer(null);
    } else {
      markUnavailable();
    }
    return removed;
  }, [args.neutralHost, markUnavailable]);

  const clearBeforeReset = useCallback(() => {
    skipWrite.current = Boolean(args.resetCategory);
    return clearDeviceCopy();
  }, [args.resetCategory, clearDeviceCopy]);

  const discard = useCallback(() => {
    if (!clearBeforeReset()) {
      skipWrite.current = false;
      return;
    }
    setState('discarded');
    args.onReset();
  }, [args.onReset, clearBeforeReset]);

  const resume = useCallback(() => {
    if (!offer) return;
    skipWrite.current = true;
    args.onRestore(offer);
    setOffer(null);
    setState('saved');
  }, [args.onRestore, offer]);

  return { clearBeforeReset, clearDeviceCopy, discard, enabled, offer, resume, state };
}
