import type { AccountDraftWriteQueue, DraftWriteSnapshot } from './account-draft-write-queue';
import type { DraftLifecycleCommands } from './draft-lifecycle-commands';
import type { DraftEditor, DraftEditorToken } from './draft-lifecycle-editor';

type Handoff = Readonly<{ queue: AccountDraftWriteQueue; snapshot: DraftWriteSnapshot | null }>;
type PendingEdit = { key: string; token: DraftEditorToken | null };

/** Logical exit admission per editor, owned apart from the quiet-window timer handle. */
const pendingEdits = new WeakMap<DraftEditor, PendingEdit>();
/** The one suspended exit per editor; only the cleanup that created it may finalize it. */
const exits = new WeakMap<DraftEditor, object>();

/**
 * Edit-effect setup. A changed generation, owner or fingerprint is a new automatic admission the
 * quiet tick or an actual exit may admit. Dependency cleanup never erases it; an identical
 * rerender keeps the current marker, including a deliberate cancellation, and returns null for
 * it so the quiet tick honors the same cancellation as an actual exit. Otherwise returns the
 * token that admission carries.
 */
export function notePendingDraftEdit(editor: DraftEditor): DraftEditorToken | null {
  const token = editor.token();
  const key = JSON.stringify([token.generation, token.owner, token.fingerprint]);
  const pending = pendingEdits.get(editor);
  if (pending?.key === key) return pending.token;
  pendingEdits.set(editor, { key, token });
  return token;
}

/** Deliberate resume supersedes the facts it replaces; exit must never recreate that source. */
export function cancelPendingDraftEdit(editor: DraftEditor): void {
  const pending = pendingEdits.get(editor);
  if (pending) pending.token = null;
}

/**
 * The quiet-window tick's own admission guards, evaluated once at actual exit: a still-owned,
 * known verified account not awaiting a reset or explicit save and holding no retirement,
 * deletion or continuation. A held first list does not block the same verified owner's typed
 * facts; that list is dropped at exit, so it never resumes, adopts or publishes an older source.
 */
function admits(editor: DraftEditor): boolean {
  return (
    editor.owns(editor.token()) &&
    editor.current().account !== undefined &&
    editor.account?.emailVerified === true &&
    !editor.explicitRequired &&
    !editor.awaitingReset &&
    !editor.terminal
  );
}

/** The latest edit admission, unless a deliberate command cancelled it, for this owner/generation. */
function pendingOwned(editor: DraftEditor): boolean {
  const token = pendingEdits.get(editor)?.token;
  return token !== null && token !== undefined && editor.owns(token);
}

/** The queue that already owns this editor's writes, plus its newest unacknowledged facts. */
function handoff(editor: DraftEditor): Handoff | null {
  if (!admits(editor)) return null;
  const latest = pendingOwned(editor) ? editor.snapshot() : null;
  const clean = editor.view.active !== null && editor.savedFingerprint === latest?.fingerprint;
  const snapshot = latest && !clean ? latest : null;
  const queue = snapshot ? editor.getQueue() : editor.queue;
  return queue ? { queue, snapshot } : null;
}

/**
 * Soft unmount. UI ownership ends first: operations and reads are superseded and the editor is
 * disposed, so no queue, read or manager callback can publish, adopt or act for a later owner.
 * Only then is the latest supported snapshot admitted to the queue that already owns it; the
 * sealed queue serializes on each acknowledged version until quiescent, then disposes. Failed,
 * conflicting and unknown creates stay frozen. Document unload cannot await this server action.
 */
export function endDraftLifecycle(commands: DraftLifecycleCommands): void {
  const owned = handoff(commands.editor);
  commands.dispose(owned !== null);
  if (!owned) return;
  if (owned.snapshot) owned.queue.enqueue(owned.snapshot);
  void owned.queue.settle();
}

/** A suspended exit revived by the same mount (a React StrictMode rehearsal) keeps its owner. */
export function attachDraftLifecycle(commands: DraftLifecycleCommands): void {
  if (exits.delete(commands.editor)) commands.editor.disposed = false;
}

/**
 * Lifecycle-effect cleanup, which React runs on actual unmount and in a development StrictMode
 * setup→cleanup→setup rehearsal. UI ownership is suspended synchronously, so owns(), live
 * operations, read acceptance and publishing fail closed and no in-flight callback can act. The
 * rehearsal re-runs setup synchronously and reattaches; only this exit, if still current one
 * microtask later, finalizes through endDraftLifecycle exactly once. Dependency cleanup never
 * flushes, and a superseded exit never disposes or creates a second queue.
 */
export function detachDraftLifecycle(commands: DraftLifecycleCommands): void {
  const { editor } = commands;
  if (editor.disposed) return;
  const exit = {};
  exits.set(editor, exit);
  editor.disposed = true;
  queueMicrotask(() => {
    if (exits.get(editor) !== exit) return;
    exits.delete(editor);
    editor.disposed = false; // re-evaluated synchronously under the same guards, then disposed
    endDraftLifecycle(commands);
  });
}
