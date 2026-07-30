'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
// prettier-ignore
import { ANONYMOUS_DRAFT_KEY, createAnonymousDraftSnapshot, getAnonymousDraftStorage, readAnonymousDraft, removeAnonymousDraft, runAnonymousDraftLocked, sameAnonymousDraftRecord, writeAnonymousDraft, type AnonymousDraftRecord, type AnonymousDraftSnapshot, type LockedResult, type ReadResult } from './anonymous-draft-recovery';
import { EMPTY_DRAFT } from './constants';
import type { CategoryId, DraftSaveState, DraftState, StepId } from './types';
// prettier-ignore
type RecoveryState = 'idle' | 'saved' | 'offer' | 'conflict' | 'retained' | 'unavailable' | 'discarded' | 'secure';
// prettier-ignore
type Args = Readonly<{ activeFingerprint?: string | null; activeId: string | null; category: CategoryId | null; draft: DraftState; lifecycleState: DraftSaveState; neutralHost?: string | null; onExternalChange?: () => void; onReset: () => void; onRestore: (draft: AnonymousDraftSnapshot) => void; resetCategory: CategoryId | null; step: StepId }>;
// prettier-ignore
function isNeutralHost(configured?: string | null) { return typeof location !== 'undefined' && (location.hostname.toLowerCase() === 'ida.localhost' || Boolean(configured && location.host.toLowerCase() === configured.toLowerCase())); }
// prettier-ignore
function recordFingerprint(value: AnonymousDraftSnapshot) { const { draft } = value; return JSON.stringify([value.category, draft.counterparty, draft.desiredOutcome, draft.incidentDate, draft.issueType, value.resumeStep, draft.summary]); }
// prettier-ignore
function fingerprint(category: CategoryId | null, draft: DraftState, step: StepId) { const value = category ? createAnonymousDraftSnapshot(category, draft, step) : null; return value ? recordFingerprint(value) : JSON.stringify([category, draft, step]); }
// prettier-ignore
function captureTime() { try { const now = Date.now(); return Number.isFinite(now) ? now : null; } catch { return null; } }
type LockedRun<T> = Readonly<{ current: boolean; result: LockedResult<T | null> }>;
// prettier-ignore
export function useAnonymousDraftRecovery(args: Args) {
  // prettier-ignore
  const [busy, setBusy] = useState(false), [enabled, setEnabled] = useState(false), [offer, setOffer] = useState<AnonymousDraftRecord | null>(null), [ready, setReady] = useState(false), [retry, setRetry] = useState(0), [state, setState] = useState<RecoveryState>('idle');
  // prettier-ignore
  const abortRef = useRef<AbortController | null>(null), actionBusy = useRef(false), activeIdRef = useRef(args.activeId), contextEpoch = useRef(0), contextValueRef = useRef(''), currentContextRef = useRef(''), currentFingerprintRef = useRef(''), currentSnapshotRef = useRef<AnonymousDraftSnapshot | null>(null), generation = useRef(0), interaction = useRef(false), invalidated = useRef(false), knownRecord = useRef<AnonymousDraftRecord | null>(null), localWrites = useRef(0), mounted = useRef(true), offerRequired = useRef(false), promotionFingerprint = useRef<{ source: string; targetId: string | null } | null>(null), reconcileAbortRef = useRef<AbortController | null>(null), reconciliation = useRef(false), suppression = useRef<{ from: string; to: string } | null>(null), terminalInvalidation = useRef(false), previousLifecycle = useRef(args.lifecycleState);
  const neutralHost = isNeutralHost(args.neutralHost), currentSnapshot = args.category ? createAnonymousDraftSnapshot(args.category, args.draft, args.step) : null, currentFingerprint = currentSnapshot ? recordFingerprint(currentSnapshot) : fingerprint(args.category, args.draft, args.step), contextValue = JSON.stringify([currentFingerprint, args.activeId, args.lifecycleState]); if (contextValueRef.current !== contextValue) { contextValueRef.current = contextValue; contextEpoch.current += 1; } const currentContext = JSON.stringify([contextEpoch.current, contextValue]); activeIdRef.current = args.activeId; currentContextRef.current = currentContext; currentFingerprintRef.current = currentFingerprint; currentSnapshotRef.current = currentSnapshot;
  // prettier-ignore
  const resetFingerprint = fingerprint(args.resetCategory, EMPTY_DRAFT, args.resetCategory ? 'details' : 'category'), pending = args.lifecycleState === 'saving' || args.lifecycleState === 'loading', promotion = promotionFingerprint.current, copyCurrent = Boolean(knownRecord.current && recordFingerprint(knownRecord.current) === currentFingerprint), activeCopyCurrent = Boolean(args.activeId && ((args.lifecycleState === 'saved' && promotion && (!promotion.targetId || promotion.targetId === args.activeId)) || (!knownRecord.current && args.lifecycleState === 'saved') || copyCurrent));
  // prettier-ignore
  const markUnavailable = useCallback((retainKnown = true) => { if (terminalInvalidation.current) { reconciliation.current = false; setEnabled(false); setOffer(null); setState('discarded'); return; } reconciliation.current = true; setEnabled(false); setOffer(null); if (!retainKnown) knownRecord.current = null; setState(retainKnown && knownRecord.current ? 'retained' : 'unavailable'); }, []);
  // prettier-ignore
  const markRetained = useCallback(() => { reconciliation.current = true; setEnabled(false); setOffer(null); setState('retained'); }, []);
  // prettier-ignore
  const supersede = useCallback(() => { generation.current += 1; abortRef.current?.abort(); reconcileAbortRef.current?.abort(); abortRef.current = null; reconcileAbortRef.current = null; }, []);
  // prettier-ignore
  const runLocked = useCallback(async <T,>(task: (current: () => boolean, executionNow: number) => T, boundContext?: string): Promise<LockedRun<T>> => { const id = ++generation.current; abortRef.current?.abort(); reconcileAbortRef.current?.abort(); const controller = new AbortController(); abortRef.current = controller; const current = () => mounted.current && generation.current === id && (!boundContext || currentContextRef.current === boundContext); const result = await runAnonymousDraftLocked(() => { if (!current()) return null; const executionNow = Date.now(); if (!Number.isFinite(executionNow)) throw new Error('invalid clock'); return task(current, executionNow); }, controller.signal); if (abortRef.current === controller) abortRef.current = null; return { current: current(), result }; }, []);
  // prettier-ignore
  const runReconcile = useCallback(async <T,>(task: (current: () => boolean, executionNow: number) => T): Promise<LockedRun<T>> => { const id = generation.current; reconcileAbortRef.current?.abort(); const controller = new AbortController(); reconcileAbortRef.current = controller; const current = () => mounted.current && generation.current === id; const result = await runAnonymousDraftLocked(() => { if (!current()) return null; const executionNow = Date.now(); if (!Number.isFinite(executionNow)) throw new Error('invalid clock'); return task(current, executionNow); }, controller.signal); if (reconcileAbortRef.current === controller) reconcileAbortRef.current = null; return { current: current(), result }; }, []);
  // prettier-ignore
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; supersede(); }; }, [supersede]);
  // prettier-ignore
  const applyRead = useCallback((result: ReadResult, fromEvent = false) => { if (result.status === 'unavailable' || result.status === 'invalid') return markUnavailable(result.status !== 'invalid'); reconciliation.current = false; setEnabled(true); if (result.status === 'none') { terminalInvalidation.current = fromEvent; offerRequired.current = false; knownRecord.current = null; setOffer(null); if (fromEvent) { invalidated.current = true; setEnabled(false); } setState(fromEvent ? 'discarded' : 'idle'); return; } terminalInvalidation.current = false; const matches = recordFingerprint(result.record) === currentFingerprintRef.current; offerRequired.current = !fromEvent || !matches; knownRecord.current = result.record; if (fromEvent && matches) invalidated.current = false; setOffer(fromEvent && matches ? null : result.record); setState(fromEvent ? (matches ? 'saved' : 'conflict') : 'offer'); }, [markUnavailable]);
  // prettier-ignore
  useEffect(() => { if (!neutralHost) { supersede(); setEnabled(false); setOffer(null); setReady(true); setState('idle'); return; } void runLocked((current, now) => current() ? readAnonymousDraft(getAnonymousDraftStorage(), now) : null).then(({ current, result }) => { if (!current) return; if (result.status === 'unavailable' || !result.value) markUnavailable(); else applyRead(result.value); setReady(true); }); }, [applyRead, markUnavailable, neutralHost, runLocked, supersede]);
  useEffect(() => {
    if (!neutralHost) return;
    const onStorage = (event: StorageEvent) => {
      if (event.key !== ANONYMOUS_DRAFT_KEY && event.key !== null) return;
      const storage = getAnonymousDraftStorage();
      if (event.storageArea && event.storageArea !== storage) { try { if (event.storageArea === globalThis.sessionStorage) return; } catch {} if (storage) return; }
      if (event.newValue === null) { terminalInvalidation.current = true; offerRequired.current = false; invalidated.current = true; }
      args.onExternalChange?.();
      if (!storage) return void markUnavailable();
      if (localWrites.current) return;
      invalidated.current = true;
      void runReconcile((current, now) => current() ? readAnonymousDraft(storage, now) : null).then(({ current, result }) => {
        if (!current) return;
        if (result.status === 'unavailable' || !result.value) markUnavailable();
        else applyRead(result.value, true);
      });
    };
    addEventListener('storage', onStorage); return () => removeEventListener('storage', onStorage);
  }, [applyRead, args.onExternalChange, markUnavailable, neutralHost, runReconcile]);
  useEffect(() => {
    if (!neutralHost || !ready || activeCopyCurrent || copyCurrent || offer || interaction.current || terminalInvalidation.current || (invalidated.current && !reconciliation.current) || pending) return;
    if (args.activeId && args.lifecycleState === 'saved' && knownRecord.current && recordFingerprint(knownRecord.current) !== currentFingerprint) { setOffer(knownRecord.current); setState('conflict'); return; }
    const snapshot = args.category ? createAnonymousDraftSnapshot(args.category, args.draft, args.step) : null;
    if (!snapshot) { supersede(); if (args.category) setEnabled(false); setOffer(null); if (!reconciliation.current) setState(knownRecord.current ? 'retained' : 'idle'); return; }
    if (suppression.current) {
      const { from, to } = suppression.current;
      if (currentFingerprint === to) { suppression.current = null; return; }
      if (currentFingerprint === from && from !== to) return;
      suppression.current = null;
    }
    if (reconciliation.current) {
      void runLocked((current, now) => current() ? readAnonymousDraft(getAnonymousDraftStorage(), now) : null).then(({ current, result }) => { if (!current) { return; } if (result.status === 'unavailable' || !result.value) { return markUnavailable(); } const value = result.value; if (value.status === 'available' && offerRequired.current) { applyRead(value); } else if (value.status === 'none' || (value.status === 'available' && knownRecord.current && sameAnonymousDraftRecord(value.record, knownRecord.current))) { reconciliation.current = false; invalidated.current = false; knownRecord.current = value.status === 'available' ? value.record : null; setEnabled(true); setOffer(null); setState('idle'); setRetry(count => count + 1); } else { applyRead(value, true); } });
      return;
    }
    const expected = knownRecord.current, now = captureTime(); if (now === null) return markUnavailable();
    setState(value => value === 'saved' ? 'idle' : value);
    localWrites.current += 1;
    void runLocked((current, executionNow) => current() ? writeAnonymousDraft(getAnonymousDraftStorage(), snapshot, expected, now, executionNow) : null, currentContext).then(({ current, result }) => {
      if (!current) return;
      if (result.status === 'unavailable') return markUnavailable();
      if (!result.value) return;
      if (result.value.status === 'invalid') return markUnavailable(false);
      if (result.value.status === 'unavailable') return markUnavailable();
      setEnabled(true);
      const value = result.value;
      if (value.status === 'saved') { terminalInvalidation.current = false; offerRequired.current = false; invalidated.current = false; knownRecord.current = value.record; setOffer(null); setState('saved'); }
      else if (value.status === 'conflict') { offerRequired.current = true; knownRecord.current = value.record; setOffer(value.record); setState('conflict'); }
      else { invalidated.current = true; if (expected) markRetained(); else markUnavailable(); }
    }).finally(() => { localWrites.current -= 1; });
  }, [activeCopyCurrent, applyRead, args.category, args.draft, args.step, copyCurrent, currentContext, currentFingerprint, markUnavailable, neutralHost, offer, pending, ready, retry, runLocked, supersede]);
  useEffect(() => {
    const previous = previousLifecycle.current; previousLifecycle.current = args.lifecycleState;
    if (previous !== 'saving' && args.lifecycleState === 'saving') {
      promotionFingerprint.current = !offer && state !== 'conflict' ? { source: currentFingerprint, targetId: null } : null;
      return;
    }
    if (previous === 'saving' && args.lifecycleState !== 'saving' && args.lifecycleState !== 'saved') { promotionFingerprint.current = null; return; }
    if (previous !== 'saving' || args.lifecycleState !== 'saved' || !args.activeId) return;
    void (async () => {
      const activePromotion = promotionFingerprint.current, promotedId = args.activeId; if (!activePromotion) return; activePromotion.targetId = promotedId;
      const savedFingerprint = activePromotion.source, serverMismatch = args.activeFingerprint !== savedFingerprint;
      const orderingNow = captureTime(); if (orderingNow === null) { if (promotionFingerprint.current === activePromotion) promotionFingerprint.current = null; return markUnavailable(); }
      const output = await runLocked((current, executionNow) => {
        if (!current() || activeIdRef.current !== promotedId) return null; const storage = getAnonymousDraftStorage(), stored = readAnonymousDraft(storage, executionNow), latest = currentSnapshotRef.current;
        if (serverMismatch) return stored.status === 'available' ? { status: 'changed' as const, record: stored.record } : stored;
        if (stored.status !== 'available' || recordFingerprint(stored.record) !== savedFingerprint) { if (stored.status !== 'available') { return stored; } if (latest && recordFingerprint(latest) === savedFingerprint && knownRecord.current && sameAnonymousDraftRecord(stored.record, knownRecord.current)) { return removeAnonymousDraft(storage, stored.record, executionNow); } return { status: 'changed' as const, record: stored.record }; }
        return latest && recordFingerprint(latest) !== savedFingerprint ? writeAnonymousDraft(storage, latest, stored.record, orderingNow, executionNow) : removeAnonymousDraft(storage, stored.record, executionNow);
      }); if (promotionFingerprint.current === activePromotion) promotionFingerprint.current = null;
      if (!output.current || activeIdRef.current !== promotedId) return;
      if (output.result.status === 'unavailable' || !output.result.value || output.result.value.status === 'unavailable') return knownRecord.current ? markRetained() : markUnavailable();
      if (output.result.value.status === 'invalid') return markUnavailable(false);
      const value = output.result.value;
      if (value.status === 'changed' || value.status === 'conflict') { offerRequired.current = true; knownRecord.current = value.record; setOffer(value.record); setState('conflict'); }
      else if (value.status === 'saved') { offerRequired.current = false; knownRecord.current = value.record; setOffer(null); setState('saved'); }
      else if (value.status === 'stale') { invalidated.current = true; if (knownRecord.current) markRetained(); else markUnavailable(); }
      else { offerRequired.current = false; knownRecord.current = null; setOffer(null); setState('secure'); }
    })();
  }, [args.activeFingerprint, args.activeId, args.lifecycleState, currentFingerprint, markRetained, markUnavailable, offer, runLocked, state]);
  // prettier-ignore
  const clearDeviceCopy = useCallback(async () => { if (!neutralHost) { return true; } const expected = offer ?? knownRecord.current; const output = await runLocked((current, executionNow) => { if (!current()) { return null; } if (expected) { return removeAnonymousDraft(getAnonymousDraftStorage(), expected, executionNow); } const value = readAnonymousDraft(getAnonymousDraftStorage(), executionNow); return value.status === 'available' ? { status: 'changed' as const, record: value.record } : value; }, currentContext); if (!output.current) { return false; } if (output.result.status === 'unavailable' || !output.result.value) { if (expected) { markRetained(); } else { markUnavailable(); } return false; } const value = output.result.value; if (value.status === 'invalid') { markUnavailable(false); return false; } if (value.status === 'unavailable') { if (expected) { markRetained(); } else { markUnavailable(); } return false; } if (value.status === 'changed') { offerRequired.current = true; knownRecord.current = value.record; setOffer(value.record); setState('conflict'); return false; } terminalInvalidation.current = false; offerRequired.current = false; invalidated.current = false; reconciliation.current = false; promotionFingerprint.current = null; knownRecord.current = null; setEnabled(true); setOffer(null); return true; }, [currentContext, markRetained, markUnavailable, neutralHost, offer, runLocked]);
  const clearBeforeReset = useCallback(async () => {
    if (pending || actionBusy.current) return false; actionBusy.current = true; setBusy(true);
    try { if (!(await clearDeviceCopy())) return false; invalidated.current = false; suppression.current = { from: currentFingerprint, to: resetFingerprint }; setState('discarded'); return true; }
    finally { actionBusy.current = false; setBusy(false); }
  }, [clearDeviceCopy, currentFingerprint, pending, resetFingerprint]);
  // prettier-ignore
  const discard = useCallback(() => { void clearBeforeReset().then(cleared => { if (cleared) args.onReset(); }); }, [args.onReset, clearBeforeReset]);
  const resume = useCallback(() => {
    if (pending || actionBusy.current || !offer) return;
    interaction.current = true; actionBusy.current = true; setBusy(true);
    void runLocked((current, now) => current() ? readAnonymousDraft(getAnonymousDraftStorage(), now) : null, currentContext).then(({ current, result }) => {
      if (!current) return;
      if (result.status === 'unavailable' || !result.value || result.value.status === 'unavailable') return markUnavailable();
      if (result.value.status === 'invalid') return markUnavailable(false);
      if (result.value.status === 'none') { terminalInvalidation.current = true; invalidated.current = true; knownRecord.current = null; setEnabled(false); setOffer(null); setState('discarded'); }
      else if (!sameAnonymousDraftRecord(result.value.record, offer)) { offerRequired.current = true; knownRecord.current = result.value.record; setOffer(result.value.record); setState('conflict'); }
      else { offerRequired.current = false; invalidated.current = false; knownRecord.current = result.value.record; suppression.current = { from: currentFingerprint, to: recordFingerprint(result.value.record) }; args.onReset(); args.onRestore(result.value.record); setOffer(null); setState('saved'); }
    }).finally(() => { interaction.current = false; actionBusy.current = false; setBusy(false); });
  }, [args.onReset, args.onRestore, currentContext, currentFingerprint, markUnavailable, offer, pending, runLocked]);
  return { busy, clearBeforeReset, clearDeviceCopy, discard, enabled, neutralHost, offer, pending: pending || busy, ready, resume, state };
}
