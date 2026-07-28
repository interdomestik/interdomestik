'use client';

import { useCallback, useEffect, useRef, useState } from 'react';

// prettier-ignore
import { ANONYMOUS_DRAFT_KEY, createAnonymousDraftSnapshot, getAnonymousDraftStorage, readAnonymousDraft, removeAnonymousDraft, sameAnonymousDraftRecord, writeAnonymousDraft, type AnonymousDraftRecord, type AnonymousDraftSnapshot } from './anonymous-draft-recovery';
import { EMPTY_DRAFT } from './constants';
import type { CategoryId, DraftSaveState, DraftState, StepId } from './types';

type RecoveryState =
  'idle' | 'saved' | 'offer' | 'conflict' | 'unavailable' | 'discarded' | 'secure';
// prettier-ignore
type Args = Readonly<{ activeId: string | null; category: CategoryId | null; draft: DraftState; lifecycleState: DraftSaveState; neutralHost?: string | null; onReset: () => void; onRestore: (draft: AnonymousDraftSnapshot) => void; resetCategory: CategoryId | null; step: StepId }>;
// prettier-ignore
function isNeutralRecoveryHost(configured?: string | null) { return typeof globalThis.location !== 'undefined' && (['ida.interdomestik.com', 'ida.localhost', 'ida.127.0.0.1.nip.io'].includes(globalThis.location.hostname) || Boolean(configured && globalThis.location.host.toLowerCase() === configured)); }
// prettier-ignore
function recordFingerprint(record: AnonymousDraftSnapshot) { const { draft } = record; return JSON.stringify([record.category, draft.counterparty, draft.desiredOutcome, draft.incidentDate, draft.issueType, record.resumeStep, draft.summary]); }
// prettier-ignore
function fingerprint(category: CategoryId | null, draft: DraftState, step: StepId) { const snapshot = category ? createAnonymousDraftSnapshot(category, draft, step) : null; return snapshot ? recordFingerprint(snapshot) : JSON.stringify([category, draft, step]); }

export function useAnonymousDraftRecovery(args: Args) {
  // prettier-ignore
  const [enabled, setEnabled] = useState(false), [offer, setOffer] = useState<AnonymousDraftRecord | null>(null), [ready, setReady] = useState(false), [state, setState] = useState<RecoveryState>('idle');
  // prettier-ignore
  const invalidated = useRef(false), knownRecord = useRef<AnonymousDraftRecord | null>(null), suppression = useRef<{ from: string; to: string } | null>(null), promotionCandidate = useRef<AnonymousDraftRecord | null>(null), previousLifecycleState = useRef(args.lifecycleState);
  const currentFingerprint = fingerprint(args.category, args.draft, args.step);
  // prettier-ignore
  const resetFingerprint = fingerprint(args.resetCategory, EMPTY_DRAFT, args.resetCategory ? 'details' : 'category');
  const pending = args.lifecycleState === 'saving' || args.lifecycleState === 'loading';
  // prettier-ignore
  const markUnavailable = useCallback(() => { setEnabled(false); setOffer(null); setState('unavailable'); }, []);

  useEffect(() => {
    // prettier-ignore
    if (!isNeutralRecoveryHost(args.neutralHost)) { setEnabled(false); setOffer(null); setState('idle'); return; }
    const result = readAnonymousDraft(getAnonymousDraftStorage());
    setEnabled(result.status !== 'unavailable');
    if (result.status === 'available') {
      knownRecord.current = result.record;
      setOffer(result.record);
      setState('offer');
    } else if (result.status === 'unavailable') markUnavailable();
    setReady(true);
  }, [args.neutralHost, markUnavailable]);

  useEffect(() => {
    if (!isNeutralRecoveryHost(args.neutralHost)) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANONYMOUS_DRAFT_KEY && event.key !== null) return;
      const storage = getAnonymousDraftStorage();
      if (!storage) {
        markUnavailable();
        return;
      }
      if (event.storageArea && event.storageArea !== storage) return;
      const result = readAnonymousDraft(storage);
      // prettier-ignore
      if (result.status === 'unavailable') { markUnavailable(); return; }
      setEnabled(true);
      // prettier-ignore
      if (result.status === 'none') { invalidated.current = true; knownRecord.current = null; setOffer(null); setState('discarded'); } else if (!knownRecord.current || !sameAnonymousDraftRecord(result.record, knownRecord.current)) { invalidated.current = false; knownRecord.current = result.record; setOffer(result.record); setState('conflict'); }
    };
    globalThis.addEventListener('storage', onStorage);
    return () => globalThis.removeEventListener('storage', onStorage);
  }, [args.neutralHost, markUnavailable]);

  useEffect(() => {
    if (!isNeutralRecoveryHost(args.neutralHost) || !enabled || invalidated.current) return;
    if (!ready || offer || !args.category) return;
    if (suppression.current) {
      const { from, to } = suppression.current;
      if (currentFingerprint === to) {
        suppression.current = null;
        return;
      }
      if (currentFingerprint === from && from !== to) return;
      suppression.current = null;
    }
    const snapshot = createAnonymousDraftSnapshot(args.category, args.draft, args.step);
    if (!snapshot) return;
    const result = writeAnonymousDraft(getAnonymousDraftStorage(), snapshot, knownRecord.current);
    // prettier-ignore
    if (result.status === 'saved') { knownRecord.current = result.record; setState('saved'); } else if (result.status === 'conflict') { knownRecord.current = result.record; setOffer(result.record); setState('conflict'); } else if (result.status === 'stale') { invalidated.current = true; setState('discarded'); } else markUnavailable();
  }, [args.category, args.neutralHost, currentFingerprint, enabled, markUnavailable, offer, ready]);

  useEffect(() => {
    if (!isNeutralRecoveryHost(args.neutralHost)) return;
    const previous = previousLifecycleState.current;
    previousLifecycleState.current = args.lifecycleState;
    if (previous !== 'saving' && args.lifecycleState === 'saving') {
      const current = readAnonymousDraft(getAnonymousDraftStorage());
      promotionCandidate.current =
        current.status === 'available' &&
        !offer &&
        state !== 'conflict' &&
        recordFingerprint(current.record) === currentFingerprint
          ? current.record
          : null;
      if (current.status === 'unavailable') markUnavailable();
      return;
    }
    if (previous !== 'saving' || args.lifecycleState !== 'saved' || !args.activeId) return;
    const candidate = promotionCandidate.current;
    promotionCandidate.current = null;
    if (!candidate) return;
    const result = removeAnonymousDraft(getAnonymousDraftStorage(), candidate);
    // prettier-ignore
    if (result.status === 'changed') { knownRecord.current = result.record; setOffer(result.record); setState('conflict'); } else if (result.status === 'unavailable') markUnavailable(); else { knownRecord.current = null; setOffer(null); setState('secure'); }
  }, [
    args.activeId,
    args.lifecycleState,
    args.neutralHost,
    currentFingerprint,
    markUnavailable,
    offer,
    state,
  ]);

  // prettier-ignore
  const clearDeviceCopy = useCallback(() => { if (!isNeutralRecoveryHost(args.neutralHost)) return true; const result = removeAnonymousDraft(getAnonymousDraftStorage()); if (result.status === 'unavailable') { markUnavailable(); return false; } knownRecord.current = null; setOffer(null); return true; }, [args.neutralHost, markUnavailable]);

  const clearBeforeReset = useCallback(() => {
    if (pending || !clearDeviceCopy()) return false;
    invalidated.current = false;
    suppression.current = { from: currentFingerprint, to: resetFingerprint };
    setState('discarded');
    return true;
  }, [clearDeviceCopy, currentFingerprint, pending, resetFingerprint]);

  // prettier-ignore
  const discard = useCallback(() => { if (clearBeforeReset()) args.onReset(); }, [args.onReset, clearBeforeReset]);

  const resume = useCallback(() => {
    if (pending || !offer) return;
    const result = readAnonymousDraft(getAnonymousDraftStorage());
    // prettier-ignore
    if (result.status === 'unavailable') { markUnavailable(); return; }
    // prettier-ignore
    if (result.status === 'none') { knownRecord.current = null; setOffer(null); setState('discarded'); } else if (!sameAnonymousDraftRecord(result.record, offer)) { knownRecord.current = result.record; setOffer(result.record); setState('conflict'); } else { knownRecord.current = result.record; suppression.current = { from: currentFingerprint, to: recordFingerprint(result.record) }; args.onReset(); args.onRestore(result.record); setOffer(null); setState('saved'); }
  }, [args.onReset, args.onRestore, currentFingerprint, markUnavailable, offer, pending]);

  return { clearBeforeReset, clearDeviceCopy, discard, enabled, offer, resume, state };
}
