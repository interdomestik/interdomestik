'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
// prettier-ignore
import { ANONYMOUS_DRAFT_KEY, createAnonymousDraftSnapshot, getAnonymousDraftStorage, readAnonymousDraft, removeAnonymousDraft, runAnonymousDraftLocked, sameAnonymousDraftRecord, writeAnonymousDraft, type AnonymousDraftRecord, type AnonymousDraftSnapshot, type LockedResult, type ReadResult } from './anonymous-draft-recovery';
import { EMPTY_DRAFT } from './constants';
import type { CategoryId, DraftSaveState, DraftState, StepId } from './types';
// prettier-ignore
type RecoveryState = 'idle' | 'saved' | 'offer' | 'conflict' | 'unavailable' | 'discarded' | 'secure';
// prettier-ignore
type Args = Readonly<{ activeId: string | null; category: CategoryId | null; draft: DraftState; lifecycleState: DraftSaveState; neutralHost?: string | null; onReset: () => void; onRestore: (draft: AnonymousDraftSnapshot) => void; resetCategory: CategoryId | null; step: StepId }>;
// prettier-ignore
function isNeutralHost(configured?: string | null) { return typeof location !== 'undefined' && (['ida.interdomestik.com', 'ida.localhost', 'ida.127.0.0.1.nip.io'].includes(location.hostname) || Boolean(configured && location.host.toLowerCase() === configured)); }
// prettier-ignore
function recordFingerprint(value: AnonymousDraftSnapshot) { const { draft } = value; return JSON.stringify([value.category, draft.counterparty, draft.desiredOutcome, draft.incidentDate, draft.issueType, value.resumeStep, draft.summary]); }
// prettier-ignore
function fingerprint(category: CategoryId | null, draft: DraftState, step: StepId) { const value = category ? createAnonymousDraftSnapshot(category, draft, step) : null; return value ? recordFingerprint(value) : JSON.stringify([category, draft, step]); }
type LockedRun<T> = Readonly<{ current: boolean; result: LockedResult<T | null> }>;
// prettier-ignore
export function useAnonymousDraftRecovery(args: Args) {
  // prettier-ignore
  const [enabled, setEnabled] = useState(false), [offer, setOffer] = useState<AnonymousDraftRecord | null>(null), [ready, setReady] = useState(false), [state, setState] = useState<RecoveryState>('idle');
  // prettier-ignore
  const abortRef = useRef<AbortController | null>(null), currentFingerprintRef = useRef(''), currentSnapshotRef = useRef<AnonymousDraftSnapshot | null>(null), generation = useRef(0), interaction = useRef(false), invalidated = useRef(false), knownRecord = useRef<AnonymousDraftRecord | null>(null), mounted = useRef(true), promotionFingerprint = useRef<string | null>(null), reconcileAbortRef = useRef<AbortController | null>(null), reconciliation = useRef(false), suppression = useRef<{ from: string; to: string } | null>(null), previousLifecycle = useRef(args.lifecycleState);
  const currentSnapshot = args.category ? createAnonymousDraftSnapshot(args.category, args.draft, args.step) : null, currentFingerprint = currentSnapshot ? recordFingerprint(currentSnapshot) : fingerprint(args.category, args.draft, args.step); currentFingerprintRef.current = currentFingerprint; currentSnapshotRef.current = currentSnapshot;
  // prettier-ignore
  const resetFingerprint = fingerprint(args.resetCategory, EMPTY_DRAFT, args.resetCategory ? 'details' : 'category');
  const pending = args.lifecycleState === 'saving' || args.lifecycleState === 'loading';
  // prettier-ignore
  const markUnavailable = useCallback(() => { reconciliation.current = true; setEnabled(false); setOffer(null); setState('unavailable'); }, []);
  // prettier-ignore
  const supersede = useCallback(() => { generation.current += 1; abortRef.current?.abort(); reconcileAbortRef.current?.abort(); abortRef.current = null; reconcileAbortRef.current = null; }, []);
  // prettier-ignore
  const runLocked = useCallback(async <T,>(task: (current: () => boolean) => T, boundFingerprint?: string): Promise<LockedRun<T>> => { const id = ++generation.current; abortRef.current?.abort(); reconcileAbortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller; const current = () => mounted.current && generation.current === id && (!boundFingerprint || currentFingerprintRef.current === boundFingerprint); const result = await runAnonymousDraftLocked(() => (current() ? task(current) : null), controller.signal); if (abortRef.current === controller) abortRef.current = null; return { current: current(), result }; }, []);
  // prettier-ignore
  const runReconcile = useCallback(async <T,>(task: (current: () => boolean) => T): Promise<LockedRun<T>> => { const id = generation.current; reconcileAbortRef.current?.abort(); const controller = new AbortController(); reconcileAbortRef.current = controller; const current = () => mounted.current && generation.current === id; const result = await runAnonymousDraftLocked(() => (current() ? task(current) : null), controller.signal); if (reconcileAbortRef.current === controller) reconcileAbortRef.current = null; return { current: current(), result }; }, []);
  // prettier-ignore
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; supersede(); }; }, [supersede]);
  const applyRead = useCallback((result: ReadResult, fromEvent = false) => {
    if (result.status === 'unavailable') return markUnavailable();
    reconciliation.current = false;
    setEnabled(true);
    // prettier-ignore
    if (result.status === 'none') { knownRecord.current = null; setOffer(null); if (fromEvent) { invalidated.current = true; setEnabled(false); } setState(fromEvent ? 'discarded' : 'idle'); return; }
    const matches = recordFingerprint(result.record) === currentFingerprintRef.current;
    // prettier-ignore
    knownRecord.current = result.record; if (fromEvent && matches) invalidated.current = false; setOffer(fromEvent && matches ? null : result.record); setState(fromEvent ? (matches ? 'saved' : 'conflict') : 'offer');
  }, [markUnavailable]);
  // prettier-ignore
  useEffect(() => { if (!isNeutralHost(args.neutralHost)) { supersede(); setEnabled(false); setOffer(null); setReady(true); setState('idle'); return; } void runLocked(current => current() ? readAnonymousDraft(getAnonymousDraftStorage()) : null).then(({ current, result }) => { if (!current) return; if (result.status === 'unavailable' || !result.value) markUnavailable(); else applyRead(result.value); setReady(true); }); }, [args.neutralHost, applyRead, markUnavailable, runLocked, supersede]);
  useEffect(() => {
    if (!isNeutralHost(args.neutralHost)) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANONYMOUS_DRAFT_KEY && event.key !== null) return;
      const storage = getAnonymousDraftStorage();
      if (!storage) return void markUnavailable();
      if (event.storageArea && event.storageArea !== storage) return;
      invalidated.current = true;
      void runReconcile(current => current() ? readAnonymousDraft(storage) : null).then(({ current, result }) => {
        if (!current) return;
        if (result.status === 'unavailable' || !result.value) markUnavailable();
        else applyRead(result.value, true);
      });
    };
    addEventListener('storage', onStorage); return () => removeEventListener('storage', onStorage);
  }, [args.neutralHost, applyRead, markUnavailable, runReconcile]);
  useEffect(() => {
    if (!isNeutralHost(args.neutralHost) || !ready || args.activeId || offer || interaction.current || invalidated.current || pending) return;
    const snapshot = args.category ? createAnonymousDraftSnapshot(args.category, args.draft, args.step) : null;
    if (!snapshot) { supersede(); setState(value => value === 'saved' ? 'idle' : value); return; }
    if (suppression.current) {
      const { from, to } = suppression.current;
      if (currentFingerprint === to) { suppression.current = null; return; }
      if (currentFingerprint === from && from !== to) return;
      suppression.current = null;
    }
    if (reconciliation.current) {
      void runLocked(current => current() ? readAnonymousDraft(getAnonymousDraftStorage()) : null).then(({ current, result }) => { if (!current) return; if (result.status === 'unavailable' || !result.value) return markUnavailable(); if (result.value.status === 'none') { reconciliation.current = false; invalidated.current = false; setEnabled(true); setState('idle'); } else applyRead(result.value, true); });
      return;
    }
    const expected = knownRecord.current, now = Date.now();
    void runLocked(current => current() ? writeAnonymousDraft(getAnonymousDraftStorage(), snapshot, expected, now) : null, currentFingerprint).then(({ current, result }) => {
      if (!current) return;
      if (result.status === 'unavailable') return markUnavailable();
      if (!result.value) return;
      if (result.value.status === 'unavailable') return markUnavailable();
      setEnabled(true);
      const value = result.value;
      if (value.status === 'saved') { invalidated.current = false; knownRecord.current = value.record; setOffer(null); setState('saved'); }
      else if (value.status === 'conflict') { knownRecord.current = value.record; setOffer(value.record); setState('conflict'); }
      else { invalidated.current = true; setState('discarded'); }
    });
  }, [applyRead, args.activeId, args.category, args.draft, args.neutralHost, args.step, currentFingerprint, markUnavailable, offer, pending, ready, runLocked, supersede]);
  useEffect(() => {
    const previous = previousLifecycle.current; previousLifecycle.current = args.lifecycleState;
    if (previous !== 'saving' && args.lifecycleState === 'saving') {
      promotionFingerprint.current = !offer && state !== 'conflict' ? currentFingerprint : null;
      return;
    }
    if (previous !== 'saving' || args.lifecycleState !== 'saved' || !args.activeId) return;
    void (async () => {
      const savedFingerprint = promotionFingerprint.current; promotionFingerprint.current = null; if (!savedFingerprint) return;
      const output = await runLocked(current => {
        if (!current()) return null; const storage = getAnonymousDraftStorage(), stored = readAnonymousDraft(storage);
        if (stored.status !== 'available' || recordFingerprint(stored.record) !== savedFingerprint) return stored.status === 'available' ? { status: 'changed' as const, record: stored.record } : stored;
        const latest = currentSnapshotRef.current; return latest && recordFingerprint(latest) !== savedFingerprint ? writeAnonymousDraft(storage, latest, stored.record) : removeAnonymousDraft(storage, stored.record);
      });
      if (!output.current) return;
      if (output.result.status === 'unavailable' || !output.result.value || output.result.value.status === 'unavailable') return markUnavailable();
      const value = output.result.value;
      if (value.status === 'changed' || value.status === 'conflict') { knownRecord.current = value.record; setOffer(value.record); setState('conflict'); }
      else if (value.status === 'saved') { knownRecord.current = value.record; setOffer(null); setState('saved'); }
      else if (value.status === 'stale') { invalidated.current = true; setEnabled(false); setState('discarded'); }
      else { knownRecord.current = null; setOffer(null); setState('secure'); }
    })();
  }, [args.activeId, args.lifecycleState, currentFingerprint, markUnavailable, offer, runLocked, state]);
  const clearDeviceCopy = useCallback(async () => {
    if (!isNeutralHost(args.neutralHost)) return true;
    const expected = offer ?? knownRecord.current;
    const output = await runLocked(current => {
      if (!current()) return null;
      if (expected) return removeAnonymousDraft(getAnonymousDraftStorage(), expected);
      const value = readAnonymousDraft(getAnonymousDraftStorage());
      return value.status === 'available' ? { status: 'changed' as const, record: value.record } : value;
    });
    if (!output.current) return false;
    if (output.result.status === 'unavailable' || !output.result.value) { markUnavailable(); return false; }
    const value = output.result.value;
    if (value.status === 'unavailable') { markUnavailable(); return false; }
    if (value.status === 'changed') { knownRecord.current = value.record; setOffer(value.record); setState('conflict'); return false; }
    knownRecord.current = null; setOffer(null); return true;
  }, [args.neutralHost, markUnavailable, offer, runLocked]);
  const clearBeforeReset = useCallback(async () => {
    if (pending || !(await clearDeviceCopy())) return false;
    invalidated.current = false; suppression.current = { from: currentFingerprint, to: resetFingerprint }; setState('discarded'); return true;
  }, [clearDeviceCopy, currentFingerprint, pending, resetFingerprint]);
  // prettier-ignore
  const discard = useCallback(() => { void clearBeforeReset().then(cleared => { if (cleared) args.onReset(); }); }, [args.onReset, clearBeforeReset]);
  const resume = useCallback(() => {
    if (pending || !offer) return;
    interaction.current = true;
    void runLocked(current => current() ? readAnonymousDraft(getAnonymousDraftStorage()) : null).then(({ current, result }) => {
      if (!current) return;
      if (result.status === 'unavailable' || !result.value || result.value.status === 'unavailable') return markUnavailable();
      if (result.value.status === 'none') { invalidated.current = true; knownRecord.current = null; setOffer(null); setState('discarded'); }
      else if (!sameAnonymousDraftRecord(result.value.record, offer)) { knownRecord.current = result.value.record; setOffer(result.value.record); setState('conflict'); }
      else { invalidated.current = false; knownRecord.current = result.value.record; suppression.current = { from: currentFingerprint, to: recordFingerprint(result.value.record) }; args.onReset(); args.onRestore(result.value.record); setOffer(null); setState('saved'); }
    }).finally(() => { interaction.current = false; });
  }, [args.onReset, args.onRestore, currentFingerprint, markUnavailable, offer, pending, runLocked]);
  return { clearBeforeReset, clearDeviceCopy, discard, enabled, offer, resume, state };
}
