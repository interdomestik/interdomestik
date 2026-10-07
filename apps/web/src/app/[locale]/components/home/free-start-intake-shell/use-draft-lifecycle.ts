'use client';

import { useEffect, useRef, useState } from 'react';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftEditorArgs, type DraftEditorView } from './draft-lifecycle-editor';
import { shownState } from './draft-lifecycle-operations';
import {
  attachDraftLifecycle,
  cancelPendingDraftEdit,
  detachDraftLifecycle,
  notePendingDraftEdit,
} from './draft-lifecycle-unmount';

/** Trailing quiet window for repeated automatic edit admission only; deliberate commands and
 * lifecycle boundaries (bootstrap, release, retirement recovery) keep their immediate writes. */
const EDIT_AUTOSAVE_QUIET_MS = 250;

export function useDraftLifecycle(args: DraftEditorArgs) {
  const latest = useRef(args);
  latest.current = args;
  const [view, setView] = useState<DraftEditorView>({
    active: null,
    items: [],
    nextCursor: null,
    intent: null,
    state: 'idle',
    verified: args.account?.emailVerified === true,
    identityKey: 0,
    readAdmitted: false,
    managerBusy: false,
  });
  const holder = useRef<DraftLifecycleCommands | null>(null);
  if (!holder.current)
    holder.current = new DraftLifecycleCommands(new DraftEditor(() => latest.current, setView));
  const commands = holder.current;
  const editor = commands.editor;
  // The one pending edit-admission handle; only the effect run that scheduled it may clear it.
  const tick = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Declared first so a StrictMode setup→cleanup→setup rehearsal reattaches this same owner
  // before the edit effect re-runs. Cleanup suspends ownership synchronously; only an actual
  // exit finalizes, exactly once, after the rehearsal window (see detachDraftLifecycle).
  useEffect(() => {
    attachDraftLifecycle(commands);
    return () => detachDraftLifecycle(commands);
  }, [commands]);
  useEffect(() => {
    if (editor.syncAccount()) commands.invalidate();
    editor.noteEdit();
    void commands.bootstrap();
    // The tick re-checks owner, generation, prop identity and fingerprint, then lets the
    // current editor re-read its latest facts; reset, delete, owner change or disposal before
    // the tick supersedes it. Resume cancels it synchronously: generation advances only after
    // row admission. Cleanup clears only this timer handle; the logical pending admission noted
    // here survives dependency cleanup, so an actual exit can still admit the latest facts once.
    // A null token is that same admission, deliberately cancelled: no quiet tick is scheduled,
    // and this effect then owns no handle to clear or replace.
    const token = notePendingDraftEdit(editor);
    if (token === null) return undefined;
    const timer = setTimeout(() => {
      if (tick.current === timer) tick.current = null;
      if (editor.owns(token, true)) editor.autoSave();
    }, EDIT_AUTOSAVE_QUIET_MS);
    tick.current = timer;
    return () => {
      clearTimeout(timer);
      if (tick.current === timer) tick.current = null;
    };
  }, [commands, editor, args.account, args.category, args.draft, args.step]);
  return {
    ...view,
    // A live manager hold masks queue, edit and background read states until it completes.
    state: shownState(view),
    hasUnsavedChanges: Boolean(view.active && editor.savedFingerprint !== editor.fingerprint()),
    loadMore: () => commands.load(view.nextCursor),
    openSave: () => commands.openSave(),
    openManage: () => commands.openManage(),
    onVerified: () => commands.onVerified(),
    saveChanges: () => commands.saveChanges(),
    resume: (id: string, options?: Parameters<DraftLifecycleCommands['resume']>[1]) => {
      // Deliberate cancellation, before resume can await a held row under the old token: the
      // timer handle and the logical exit admission of the superseded facts both end here.
      const pending = tick.current;
      tick.current = null;
      if (pending !== null) clearTimeout(pending);
      cancelPendingDraftEdit(editor);
      return commands.resume(id, options);
    },
    remove: commands.remove.bind(commands),
    startAnother: (beforeReset?: () => Promise<boolean> | boolean) =>
      commands.startAnother(beforeReset),
    prepareForContinuation: () => commands.prepareForContinuation(),
    releaseContinuation: (receipt?: Parameters<DraftLifecycleCommands['releaseContinuation']>[0]) =>
      commands.releaseContinuation(receipt),
  };
}
