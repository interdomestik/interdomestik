'use client';

import { useEffect, useRef, useState } from 'react';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftEditorArgs, type DraftEditorView } from './draft-lifecycle-editor';

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
  });
  const holder = useRef<DraftLifecycleCommands | null>(null);
  if (!holder.current)
    holder.current = new DraftLifecycleCommands(new DraftEditor(() => latest.current, setView));
  const commands = holder.current;
  const editor = commands.editor;
  useEffect(() => {
    if (editor.syncAccount()) commands.invalidate();
    editor.noteEdit();
    void commands.bootstrap();
    editor.autoSave();
  }, [commands, editor, args.account, args.category, args.draft, args.step]);
  useEffect(() => () => commands.dispose(), [commands]);
  return {
    ...view,
    hasUnsavedChanges: Boolean(view.active && editor.savedFingerprint !== editor.fingerprint()),
    loadMore: () => commands.load(view.nextCursor),
    openSave: () => commands.openSave(),
    openManage: () => commands.openManage(),
    onVerified: () => commands.onVerified(),
    saveChanges: () => commands.saveChanges(),
    resume: commands.resume.bind(commands),
    remove: commands.remove.bind(commands),
    startAnother: (beforeReset?: () => Promise<boolean> | boolean) =>
      commands.startAnother(beforeReset),
    prepareForContinuation: () => commands.prepareForContinuation(),
    releaseContinuation: () => commands.releaseContinuation(),
  };
}
