import { accountKey, type DraftEditor, type DraftEditorToken } from './draft-lifecycle-editor';
import type { DraftOperation, DraftOperations } from './draft-lifecycle-operations';
import type { SavedDraft } from './types';

type PreparedIdentity = Pick<SavedDraft, 'id' | 'version'>;
type ContinuationLease = Readonly<{ current: () => boolean; release: () => void }>;
const leases = new WeakMap<object, ContinuationLease>();
const ownedPreparations = new WeakMap<DraftEditor, ContinuationLease>();

/** Unique client receipt; no lease metadata enters a saved fact or server action DTO. */
export function prepareDraftContinuation(
  editor: DraftEditor,
  operations: DraftOperations,
  operation: DraftOperation,
  token: DraftEditorToken,
  draft: SavedDraft
): SavedDraft {
  const receipt = { ...draft };
  let released = false;
  const ownsHold = () =>
    !released &&
    operations.live(operation) &&
    editor.owns(token) &&
    editor.terminal &&
    editor.view.active?.id === receipt.id &&
    editor.view.active.version === receipt.version;
  const lease: ContinuationLease = {
    current: () => ownsHold() && editor.owns(token, true),
    release: () => {
      if (!ownsHold()) return;
      released = true;
      if (ownedPreparations.get(editor) === lease) ownedPreparations.delete(editor);
      editor.terminal = false;
      editor.autoSave();
    },
  };
  leases.set(receipt, lease);
  ownedPreparations.set(editor, lease);
  return receipt;
}

/** The next deliberate command releases only the previous completed preparation it owns. */
export function releaseOwnedDraftPreparation(editor: DraftEditor): void {
  ownedPreparations.get(editor)?.release();
}

/** Unleased canonical ID/version callers retain their existing direct-submit contract. */
export const isDraftContinuationCurrent = (receipt: PreparedIdentity): boolean =>
  leases.get(receipt)?.current() ?? true;
export function releaseDraftContinuation(receipt?: PreparedIdentity | null): void {
  if (receipt) leases.get(receipt)?.release();
}

/** A confirmed physical delete invalidates only that owner's matching active source. */
export function acknowledgeDraftDeletion(
  editor: DraftEditor,
  id: string,
  owner: string,
  invalidateReads: () => void
): void {
  if (editor.disposed || accountKey(editor.account) !== owner || !editor.owns(editor.token()))
    return;
  const items = editor.view.items.filter(item => item.id !== id);
  if (editor.view.active?.id !== id) {
    editor.patch({ items });
    return;
  }
  editor.queue?.dispose();
  editor.queue = null;
  invalidateReads();
  editor.reset(true);
  editor.patch({ items, state: 'deleted' });
}
