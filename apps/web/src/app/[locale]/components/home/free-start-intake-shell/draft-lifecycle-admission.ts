import type { AccountDraftWriteQueue } from './account-draft-write-queue';
import { accountKey, type DraftEditor, type DraftEditorToken } from './draft-lifecycle-editor';
import type { SavedDraft } from './types';

type RevokedAdmission = {
  owner: string;
  generation: number;
  active: SavedDraft | null;
  fingerprint: string | null;
  explicitRequired: boolean;
  queue: AccountDraftWriteQueue | null;
  queueToken: DraftEditorToken | null;
  retirement: Promise<boolean | 'recovering'>;
};
const revoked = new WeakMap<DraftEditor, RevokedAdmission>();

/** Revoke access presentation, not the identity of an already dispatched write or saved source. */
export function revokeDraftAdmission(editor: DraftEditor): void {
  if (confirmAnonymousDraft(editor)) return;
  const previous = revoked.get(editor);
  const recovery =
    previous?.generation === editor.generation
      ? previous
      : {
          owner: accountKey(editor.account),
          generation: editor.generation,
          active: editor.view.active,
          fingerprint: editor.savedFingerprint,
          explicitRequired: editor.explicitRequired,
          queue: editor.queue,
          queueToken: editor.queueToken,
          // Stops undispatched work immediately; never retries a failed or indeterminate create.
          retirement: editor.queue?.retire().catch(() => false) ?? Promise.resolve(true),
        };
  const intent = editor.view.intent;
  editor.reset(true);
  recovery.generation = editor.generation;
  revoked.set(editor, recovery);
  editor.admissionRevoked = true;
  if (editor.account) editor.account = { ...editor.account, emailVerified: false };
  editor.patch({ intent, verified: false, readAdmitted: false, state: 'idle' });
}

/**
 * A truly anonymous intake has nothing to revoke: no known owner (even unverified), admitted
 * list or active row, queue, retained recovery, retired source or retirement in progress. A
 * signed-out verdict then confirms that state without a reset, so OTP identity, typed entry and
 * intent survive; the caller still returns its refusal or required failure.
 */
function confirmAnonymousDraft(editor: DraftEditor): boolean {
  const { view } = editor;
  if (
    editor.account ||
    editor.current().account ||
    revoked.has(editor) ||
    editor.admissionRevoked ||
    editor.terminal ||
    editor.queue ||
    editor.retiredDraft ||
    editor.savedFingerprint !== null ||
    view.active ||
    view.items.length > 0 ||
    view.nextCursor ||
    view.readAdmitted ||
    view.verified
  )
    return false;
  editor.explicitRequired = true;
  editor.patch({ state: 'idle' });
  return true;
}

/** Fresh server admission may recover only the same owner/tenant and original CAS identity. */
export async function restoreDraftAdmission(
  editor: DraftEditor,
  current: () => boolean
): Promise<boolean> {
  const recovery = revoked.get(editor);
  if (!recovery) return true;
  if (recovery.generation !== editor.generation) return releaseSuperseded(editor, recovery);
  if (recovery.owner && recovery.owner !== accountKey(editor.account)) return false;
  const live = () =>
    current() &&
    revoked.get(editor) === recovery &&
    recovery.generation === editor.generation &&
    editor.queue === recovery.queue;
  const safe = await recovery.retirement;
  if (!live()) return false;
  editor.admissionRevoked = false;
  if (editor.account) editor.account = { ...editor.account, emailVerified: true };
  editor.explicitRequired = recovery.explicitRequired;
  if (!safe) return retainUncertainRecovery(editor, recovery);
  const active = recovery.queue?.getDraft() ?? recovery.active;
  return reopenKnownFailure(editor, recovery, active) ?? adoptRecovered(editor, recovery, active);
}

/** A newer generation (reset, resume, delete) supersedes the hidden retained source. */
function releaseSuperseded(editor: DraftEditor, recovery: RevokedAdmission): true {
  if (editor.view.active && editor.queue === recovery.queue) {
    recovery.queue?.dispose();
    editor.queue = null;
    editor.queueToken = null;
  }
  revoked.delete(editor);
  editor.admissionRevoked = false;
  return true;
}

/** Preserve the original UUID/snapshot for an explicit retry or known-conflict Resume. */
function retainUncertainRecovery(editor: DraftEditor, recovery: RevokedAdmission): boolean {
  if (recovery.queueToken) Object.assign(recovery.queueToken, editor.token());
  editor.patch({ state: recovery.queue?.getWriteFeedback() ?? 'error' });
  revoked.delete(editor);
  return editor.view.intent === 'manage';
}

/** A known failed write reopens only for explicit retry; null when no such failure exists. */
function reopenKnownFailure(
  editor: DraftEditor,
  recovery: RevokedAdmission,
  active: SavedDraft | null
): boolean | null {
  const queue = recovery.queue;
  const feedback = queue?.getWriteFeedback();
  if (!feedback || !queue?.restoreKnownFailure()) return null;
  if (recovery.queueToken) Object.assign(recovery.queueToken, editor.token());
  editor.explicitRequired = true;
  editor.savedFingerprint = queue.getAcknowledgedFingerprint() ?? recovery.fingerprint;
  editor.patch({ active, state: feedback });
  revoked.delete(editor);
  return editor.view.intent === 'manage';
}

/** A safely retired source is adopted with its acknowledged identity, never a newer write. */
function adoptRecovered(
  editor: DraftEditor,
  recovery: RevokedAdmission,
  active: SavedDraft | null
): true {
  recovery.queue?.dispose();
  editor.queue = null;
  editor.queueToken = null;
  editor.savedFingerprint =
    recovery.queue?.getAcknowledgedFingerprint() ??
    (active?.version === recovery.active?.version ? recovery.fingerprint : null);
  editor.patch({ active });
  editor.patch({ state: editor.editedState() });
  revoked.delete(editor);
  return true;
}

/** A committed delete also invalidates a hidden retained source, never another owner or generation. */
export function invalidateExpiredDraftSource(
  editor: DraftEditor,
  id: string,
  owner: string
): boolean {
  const recovery = revoked.get(editor);
  if (
    recovery?.owner !== owner ||
    recovery.generation !== editor.generation ||
    (recovery.active?.id !== id && recovery.queue?.getDraft()?.id !== id)
  )
    return false;
  recovery.queue?.dispose();
  if (editor.queue === recovery.queue) {
    editor.queue = null;
    editor.queueToken = null;
  }
  recovery.queue = null;
  recovery.queueToken = null;
  recovery.active = null;
  recovery.fingerprint = null;
  recovery.explicitRequired = true;
  recovery.retirement = Promise.resolve(true);
  if (editor.retiredDraft?.id === id) editor.retiredDraft = null;
  editor.patch({ items: editor.view.items.filter(item => item.id !== id), state: 'deleted' });
  return true;
}
