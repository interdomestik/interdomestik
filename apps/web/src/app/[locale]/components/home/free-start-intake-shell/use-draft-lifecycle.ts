'use client';

import {
  createFreeStartDraft,
  deleteFreeStartDraft,
  listFreeStartDrafts,
  resumeFreeStartDraft,
  updateFreeStartDraft,
} from '@/actions/free-start-drafts';
import { useEffect, useRef, useState } from 'react';

// prettier-ignore
import { createUuidV4, draftFailureState, draftFingerprint, draftFingerprintState, resolveEditedDraftState, runDraftTask, withoutDraft, type CategoryId, type DraftSaveState, type DraftState, type SavedDraft, type StepId } from './types';

type Args = Readonly<{
  category: CategoryId | null;
  draft: DraftState;
  onReset: () => void;
  onResume: (draft: SavedDraft) => void;
  step: StepId;
}>;

export function useDraftLifecycle(args: Args) {
  const [active, setActive] = useState<SavedDraft | null>(null);
  const [items, setItems] = useState<SavedDraft[]>([]);
  const [nextCursor, setNextCursor] = useState<{ id: string; updatedAt: string } | null>(null);
  const [intent, setIntent] = useState<'save' | 'manage' | null>(null);
  const [state, setState] = useState<DraftSaveState>('idle');
  const [verified, setVerified] = useState(false);
  const [identityKey, setIdentityKey] = useState(0);
  const requestId = useRef(createUuidV4());
  const savedFingerprint = useRef<string | null>(null);
  const pending = useRef(false);
  const currentFingerprint = draftFingerprint(args.category, args.draft, args.step);
  // prettier-ignore
  const activeRef = useRef(active), currentFingerprintRef = useRef(currentFingerprint);
  activeRef.current = active;
  currentFingerprintRef.current = currentFingerprint;
  // prettier-ignore
  useEffect(() => { setState(current => resolveEditedDraftState(current, Boolean(args.category && args.category !== 'injury'), draftFingerprintState(Boolean(active), savedFingerprint.current, currentFingerprint))); }, [active, args.category, currentFingerprint]);
  // prettier-ignore
  const payload = () => ({ category: args.category, counterparty: args.draft.counterparty, desiredOutcome: args.draft.desiredOutcome || undefined, incidentDate: args.draft.incidentDate || undefined, issueType: args.draft.issueType || undefined, resumeStep: args.step === 'complete' ? ('preview' as const) : args.step, summary: args.draft.summary });
  // prettier-ignore
  const accept = (draft: SavedDraft) => { setActive(draft); savedFingerprint.current = draftFingerprint(draft.category, draft, draft.resumeStep); setState('saved'); };
  // prettier-ignore
  const failIntent = (next: DraftSaveState): never => { setState(next); throw new Error('secure_save_intent_failed'); };
  // prettier-ignore
  const rejectIntent = (code: string, required = false) => { const next = draftFailureState(code); if (required) { failIntent(next); } setIntent(null); setState(next); return false; };
  const load = (cursor: typeof nextCursor = null, required = false) =>
    runDraftTask(
      pending,
      async () => {
        setState('loading');
        const result = await listFreeStartDrafts({ cursor });
        // prettier-ignore
        if (!result.ok) { if (result.code === 'authRequired' && !required) { setState('idle'); return false; } return rejectIntent(result.code, required); }
        setItems(current => (cursor ? [...current, ...result.items] : result.items));
        setNextCursor(result.nextCursor);
        // prettier-ignore
        setState(draftFingerprintState(Boolean(activeRef.current), savedFingerprint.current, currentFingerprintRef.current));
        return true;
      },
      () => rejectIntent('error', required)
    );
  const store = (required = false) => {
    // prettier-ignore
    if (!args.category || args.category === 'injury') { if (required) { failIntent('unsupported'); } setIntent(null); setState('unsupported'); return false; }
    return runDraftTask(
      pending,
      async () => {
        setState('saving');
        const result = await createFreeStartDraft({
          ...payload(),
          clientRequestId: requestId.current,
        });
        // prettier-ignore
        if (!result.ok) { if (result.code === 'authRequired' && !required) { setState('idle'); return false; } return rejectIntent(result.code, required); }
        accept(result.draft);
        setVerified(true);
        return true;
      },
      () => rejectIntent('error', required)
    );
  };
  // prettier-ignore
  const onVerified = async () => { if (intent === 'manage') { if (!(await load(null, true))) { failIntent('error'); } setVerified(true); return; } if (!(await store(true))) { failIntent('error'); } };
  const saveChanges = () =>
    runDraftTask(
      pending,
      async () => {
        if (!active || !args.category || args.category === 'injury') {
          return;
        }
        setState('saving');
        const result = await updateFreeStartDraft({
          ...payload(),
          expectedVersion: active.version,
          id: active.id,
        });
        if (!result.ok) {
          return setState(result.code === 'conflict' ? 'conflict' : draftFailureState(result.code));
        }
        accept(result.draft);
      },
      () => setState('error')
    );
  const resume = (id: string) =>
    runDraftTask(
      pending,
      async () => {
        setState('loading');
        const result = await resumeFreeStartDraft({ id });
        if (!result.ok) {
          return setState(draftFailureState(result.code));
        }
        args.onResume(result.draft);
        accept(result.draft);
        setIntent(null);
      },
      () => setState('error')
    );
  const remove = (draft: SavedDraft) =>
    runDraftTask(
      pending,
      async () => {
        setState('loading');
        const result = await deleteFreeStartDraft({ id: draft.id, expectedVersion: draft.version });
        if (!result.ok) {
          return setState(result.code === 'conflict' ? 'conflict' : draftFailureState(result.code));
        }
        setItems(current => withoutDraft(current, draft.id));
        if (active?.id === draft.id) {
          setActive(null);
          savedFingerprint.current = null;
          args.onReset();
        }
        setState('deleted');
      },
      () => setState('error')
    );
  // prettier-ignore
  const startAnother = () => { if (pending.current) { return; } setActive(null); setItems([]); setIntent(null); setState('idle'); setVerified(false); setIdentityKey(key => key + 1); requestId.current = createUuidV4(); savedFingerprint.current = null; args.onReset(); };
  // prettier-ignore
  const open = async (nextIntent: 'save' | 'manage') => { if (pending.current) { return; } setIntent(nextIntent); setVerified(false); if (nextIntent === 'manage') { if (await load()) { setVerified(true); } return; } await store(); };
  // prettier-ignore
  return { active, hasUnsavedChanges: Boolean(active && savedFingerprint.current !== currentFingerprint), identityKey, intent, items, loadMore: () => load(nextCursor), nextCursor, onVerified, openManage: () => open('manage'), openSave: () => open('save'), remove, resume, saveChanges, startAnother, state, verified };
}
