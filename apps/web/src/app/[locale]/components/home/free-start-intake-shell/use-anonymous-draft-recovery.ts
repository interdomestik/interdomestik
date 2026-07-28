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
type Args = Readonly<{
  activeId: string | null;
  category: CategoryId | null;
  draft: DraftState;
  lifecycleState: DraftSaveState;
  onReset: () => void;
  onRestore: (draft: AnonymousDraftSnapshot) => void;
  resetCategory: CategoryId | null;
  step: StepId;
}>;

export function useAnonymousDraftRecovery(args: Args) {
  const [offer, setOffer] = useState<AnonymousDraftRecord | null>(null);
  const [ready, setReady] = useState(false);
  const [state, setState] = useState<RecoveryState>('idle');
  const knownUpdatedAt = useRef<string | null>(null);
  const skipWrite = useRef(false);
  const previousLifecycleState = useRef(args.lifecycleState);
  const fingerprint = JSON.stringify([args.category, args.draft, args.step]);

  useEffect(() => {
    const result = readAnonymousDraft(getAnonymousDraftStorage());
    if (result.status === 'available') {
      knownUpdatedAt.current = result.record.updatedAt;
      setOffer(result.record);
      setState('offer');
    } else if (result.status === 'unavailable') {
      setState('unavailable');
    }
    setReady(true);
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANONYMOUS_DRAFT_KEY) return;
      const result = readAnonymousDraft(getAnonymousDraftStorage());
      if (result.status === 'available' && result.record.updatedAt !== knownUpdatedAt.current) {
        knownUpdatedAt.current = result.record.updatedAt;
        setOffer(result.record);
        setState('conflict');
      }
    };
    globalThis.addEventListener('storage', onStorage);
    return () => globalThis.removeEventListener('storage', onStorage);
  }, []);

  useEffect(() => {
    if (!ready || offer || !args.category) return;
    if (skipWrite.current) {
      skipWrite.current = false;
      return;
    }
    const snapshot = createAnonymousDraftSnapshot(args.category, args.draft, args.step);
    if (!snapshot) return;
    const result = writeAnonymousDraft(
      getAnonymousDraftStorage(),
      snapshot,
      knownUpdatedAt.current
    );
    if (result.status === 'saved') {
      knownUpdatedAt.current = result.updatedAt;
      setState('saved');
    } else if (result.status === 'conflict') {
      knownUpdatedAt.current = result.record.updatedAt;
      setOffer(result.record);
      setState('conflict');
    } else {
      setState('unavailable');
    }
  }, [args.category, fingerprint, offer, ready]);

  useEffect(() => {
    const previous = previousLifecycleState.current;
    previousLifecycleState.current = args.lifecycleState;
    if (previous !== 'saving' || args.lifecycleState !== 'saved' || !args.activeId) return;
    if (removeAnonymousDraft(getAnonymousDraftStorage())) {
      knownUpdatedAt.current = null;
      setOffer(null);
      setState('secure');
    }
  }, [args.activeId, args.lifecycleState]);

  const clearDeviceCopy = useCallback(() => {
    const removed = removeAnonymousDraft(getAnonymousDraftStorage());
    if (removed) {
      knownUpdatedAt.current = null;
      setOffer(null);
    } else {
      setState('unavailable');
    }
    return removed;
  }, []);

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

  return { clearBeforeReset, clearDeviceCopy, discard, offer, resume, state };
}
