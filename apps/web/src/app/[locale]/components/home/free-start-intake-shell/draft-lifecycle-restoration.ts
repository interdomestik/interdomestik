import type { AnonymousDraftSnapshot } from './anonymous-draft-recovery';
import type { DraftEditor } from './draft-lifecycle-editor';
import type { DraftOperation, DraftOperations } from './draft-lifecycle-operations';
import {
  accountKey,
  draftFingerprint,
  hasDraftFacts,
  type DraftResetBarrier,
  type SavedDraft,
} from './types';

declare const restorationLease: unique symbol;
/** Opaque client-only capability; never part of an action DTO, URL or browser storage. */
export type DraftRestorationLease = Readonly<{ [restorationLease]: true }>;
type Grant = {
  readonly editor: DraftEditor;
  readonly barrier: DraftResetBarrier;
  readonly owner: string;
  /** The accepting reset is still the newest deliberate operation. */
  readonly current: () => boolean;
  settled: boolean;
};
const grants = new WeakMap<DraftRestorationLease, Grant>();

/**
 * Issued only to a restoration reset, right after its accepted retirement/reset, for the exact
 * barrier that reset installed with its owner/tenant and generation; null otherwise. That barrier
 * may already have been released by an actual empty render (an onReset commit before this
 * continuation); a newer barrier, owner/tenant change, revocation, disposal or other admitted
 * facts refuse it.
 */
export function leaseBrowserRestoration(
  editor: DraftEditor,
  current: () => boolean,
  barrier: DraftResetBarrier | null = editor.resetBarrier
): DraftRestorationLease | null {
  const owner = accountKey(editor.account);
  if (
    !barrier ||
    editor.disposed ||
    editor.admissionRevoked ||
    !current() ||
    editor.resetBarrier !== barrier ||
    barrier.generation !== editor.generation ||
    barrier.owner !== owner ||
    barrier.restored !== null ||
    (!editor.awaitingReset && hasDraftFacts(editor.current().draft))
  )
    return null;
  const lease = Object.freeze({}) as DraftRestorationLease;
  grants.set(lease, { editor, barrier, owner, current, settled: false });
  return lease;
}

/**
 * Successful browser-copy restoration completion, after the latest-storage comparison and before
 * adoption. It names those exact facts on its own lease's barrier, so edit sync releases
 * `awaitingReset` only once they are the current props; pre-restoration or arbitrary facts stay
 * refused. It holds after an actual empty render released the barrier, and is refused after a
 * newer reset or deliberate operation, owner/tenant change, revoked admission or disposal. A lease
 * settles once, accepted or refused, and never touches a newer barrier. Grants no access: writes
 * use the live verified owner's queue and every server action re-checks session and tenant.
 */
export function completeBrowserRestoration(
  editor: DraftEditor,
  lease: DraftRestorationLease,
  snapshot: AnonymousDraftSnapshot
): boolean {
  const grant = grants.get(lease);
  if (grant?.editor !== editor || grant.settled) return false;
  grant.settled = true;
  const { barrier } = grant;
  if (
    editor.disposed ||
    editor.terminal ||
    editor.admissionRevoked ||
    !grant.current() ||
    editor.resetBarrier !== barrier ||
    barrier.restored !== null ||
    barrier.generation !== editor.generation ||
    grant.owner !== accountKey(editor.account) ||
    !editor.owns(editor.token()) ||
    editor.view.active !== null ||
    // Only an actual empty render may have released it; other admitted facts end the lease.
    (!editor.awaitingReset && hasDraftFacts(editor.current().draft))
  )
    return false;
  barrier.restored = draftFingerprint(snapshot.category, snapshot.draft, snapshot.resumeStep);
  editor.awaitingReset = true;
  return true;
}

export type AcceptedReset = Readonly<{ op: DraftOperation; barrier: DraftResetBarrier | null }>;

/**
 * The accepted ordinary reset, the deliberate operation that performed it and the exact barrier
 * it installed; null barrier once its own onReset superseded that barrier (newer reset/owner).
 */
export async function acceptDraftReset(
  editor: DraftEditor,
  ops: DraftOperations,
  invalidate: () => void,
  beforeReset?: () => Promise<boolean> | boolean
): Promise<AcceptedReset | null> {
  const op = ops.begin();
  const token = editor.token();
  const live = () => ops.live(op) && editor.owns(token);
  if (!(await editor.retire(live)) || !live()) return null;
  const accepted = beforeReset ? await beforeReset() : true;
  if (!live()) return null;
  if (!accepted) {
    editor.terminal = false;
    return null;
  }
  invalidate();
  const generation = editor.generation + 1;
  editor.reset();
  const barrier = editor.resetBarrier;
  return { op, barrier: barrier?.generation === generation ? barrier : null };
}

/** A resumed server row becomes the active source of a new editor generation. */
export function adoptResumedDraft(
  editor: DraftEditor,
  restored: SavedDraft,
  invalidate: () => void
): void {
  editor.generation++;
  invalidate();
  editor.savedFingerprint = draftFingerprint(restored.category, restored, restored.resumeStep);
  editor.patch({ active: restored, intent: null, state: 'saved' });
  editor.current().onResume(restored);
  editor.initialized = true;
  editor.explicitRequired = false;
  editor.getQueue(true)?.adopt(restored);
}
