import {
  deleteFreeStartDraft,
  listFreeStartDrafts,
  resumeFreeStartDraft,
} from '@/actions/free-start-drafts';
import { ownsWrite } from './draft-lifecycle-admission';
import type { DraftEditor, DraftEditorToken } from './draft-lifecycle-editor';
import { DraftOperations, failDraft, type DraftOperation } from './draft-lifecycle-operations';
import {
  acknowledgeDraftDeletion,
  prepareDraftContinuation,
  releaseDraftContinuation,
} from './draft-lifecycle-continuation';
import {
  createDraftReadController,
  draftReadIdentity,
  reconcileDraftRead,
  type DraftReadController,
} from './draft-lifecycle-reads';
import {
  acceptDraftReset,
  adoptResumedDraft,
  leaseBrowserRestoration,
  type DraftRestorationLease,
} from './draft-lifecycle-restoration';
import { isReviewReadySavedDraft } from './saved-draft-continuation';
import { receiptMatches, type SavedDraft } from './types';
type Cursor = DraftEditor['view']['nextCursor'];
export class DraftLifecycleCommands {
  private readonly reads: DraftReadController;
  private readonly ops: DraftOperations;
  private bootstrapping: DraftEditorToken | null = null;
  private readonly supersede = () => this.reads.invalidate();
  constructor(readonly editor: DraftEditor) {
    this.reads = createDraftReadController({
      current: () => draftReadIdentity(editor),
      onBusy: busy => {
        if (!busy) this.ops.settle();
      },
    });
    this.ops = new DraftOperations(editor, () => this.reads.isBusy());
  }
  invalidate() {
    this.reads.invalidate();
  }
  dispose(retainQueue = false) {
    this.ops.dispose();
    this.reads.dispose();
    this.editor.dispose(retainQueue);
  }
  private failure(code: string, required = false): false {
    return failDraft(this.editor, code, required);
  }
  async load(cursor: Cursor = null, required = false, op?: DraftOperation): Promise<boolean> {
    const context = this.editor.account?.expectedContext;
    if (!context) return this.failure('authRequired', required);
    const token = this.editor.token();
    const live = () => !op || this.ops.live(op);
    let signedOut = false; // its own live revocation still rejects a required intent
    this.editor.patch({ state: this.editor.queue?.getWriteFeedback() ?? 'loading' });
    const accepted = await this.reads.run(
      () => listFreeStartDrafts({ cursor, expectedContext: context }),
      result => {
        if (!live() || !reconcileDraftRead(this.editor, this.reads, token, true)) return false;
        if (!result.ok) {
          signedOut = result.code === 'authRequired';
          return this.ops.failReceipt(result.code);
        }
        if (!receiptMatches(result.expectedContext, context))
          return this.failure('unavailableAccountContext');
        this.editor.patch({
          items: cursor ? [...this.editor.view.items, ...result.items] : result.items,
          nextCursor: result.nextCursor,
          readAdmitted: true,
          state: this.editor.queue?.getWriteFeedback() ?? this.editor.editedState(),
        });
        this.editor.initialized = true;
        return true;
      },
      () => {
        if (live() && reconcileDraftRead(this.editor, this.reads, token)) this.failure('error');
      }
    );
    if (!accepted && required && (signedOut || this.editor.owns(token)))
      throw new Error('secure_save_intent_failed');
    return accepted;
  }
  /** The sole listed row, only while no intent, active source, facts or other category exists. */
  private soleRestorable(mark: number): SavedDraft | null {
    const { view } = this.editor;
    const { category, draft } = this.editor.current();
    const sole = view.items.length === 1 ? (view.items[0] ?? null) : null;
    if (!sole || !this.ops.quiet(mark) || view.intent === 'manage' || view.active) return null;
    if (Object.values(draft).some(Boolean)) return null;
    return category === null || category === sole.category ? sole : null;
  }
  async bootstrap() {
    if (
      (this.bootstrapping && this.editor.owns(this.bootstrapping)) ||
      this.editor.initialized ||
      !this.editor.account?.emailVerified ||
      this.editor.awaitingReset ||
      this.editor.terminal
    )
      return;
    const token = this.editor.token();
    const mark = this.ops.mark();
    this.bootstrapping = token;
    try {
      if (await this.load()) {
        // Sole-draft restore never competes with a pending or newer deliberate intent, nor
        // replaces a different explicit category already chosen for the current intake.
        const sole = this.soleRestorable(mark);
        if (sole) await this.resume(sole.id);
        this.editor.autoSave();
      }
    } finally {
      if (this.bootstrapping === token) this.bootstrapping = null;
      if (
        !this.editor.disposed &&
        (!this.editor.owns(token) || token.fingerprint !== this.editor.fingerprint()) &&
        !this.editor.initialized
      )
        void this.bootstrap();
    }
  }
  async store(required = false) {
    const snapshot = this.editor.snapshot();
    if (!snapshot) {
      this.editor.patch({
        state: this.editor.current().category === 'injury' ? 'unsupported' : 'invalid',
      });
      if (required) throw new Error('secure_save_intent_failed');
      return false;
    }
    this.editor.explicitRequired = false;
    this.editor.awaitingReset = false;
    const queue = this.editor.getQueue();
    if (!queue) return this.failure('authRequired', required);
    // A valid deliberate write supersedes pending reads without changing owner generation.
    this.reads.invalidate();
    const token = this.editor.token();
    this.editor.initialized = true;
    if (this.editor.view.active && this.editor.savedFingerprint === snapshot.fingerprint)
      return true;
    queue.enqueue(snapshot);
    queue.retry();
    const saved = await queue.drain();
    if (
      !this.editor.owns(token) ||
      !saved ||
      this.editor.savedFingerprint !== this.editor.fingerprint()
    ) {
      if (required && ownsWrite(this.editor, token)) throw new Error('secure_save_intent_failed');
      return false;
    }
    return true;
  }
  async openSave() {
    const op = this.ops.begin();
    this.editor.patch({ intent: 'save' });
    if ((await this.ops.discover(op)) !== true || !this.ops.live(op)) return false;
    return this.store();
  }
  /** `managerBusy` from entry until this operation's own list settles; stale ones never list. */
  async openManage(): Promise<boolean> {
    return this.ops.hold(async op => {
      this.editor.patch({ intent: 'manage' });
      if (!(await this.ops.discover(op)) || !this.ops.live(op)) return false;
      return this.load(null, false, op);
    });
  }
  async onVerified() {
    const op = this.ops.begin();
    // A superseded verification never completed its intent, so it rejects instead of succeeding.
    if ((await this.ops.discover(op, true)) !== true || !this.ops.live(op))
      throw new Error('secure_save_intent_failed');
    if (this.editor.view.intent === 'manage') await this.load(null, true, op);
    else await this.store(true);
  }
  async saveChanges() {
    return this.store();
  }
  async resume(id: string, options?: { reviewOnly: boolean }) {
    const op = this.ops.begin();
    if (!this.editor.account) await this.ops.discover(op);
    if (!this.ops.live(op)) return false;
    const context = this.editor.account?.expectedContext;
    if (!context) return this.failure('authRequired');
    const token = this.editor.token();
    const live = () => this.ops.live(op) && this.editor.owns(token);
    if (!(await this.editor.retire(live, true)) || !live()) return false;
    this.editor.terminal = false;
    this.editor.patch({ state: 'loading' });
    let row: SavedDraft | null = null;
    const accepted = await this.reads.run(
      () => resumeFreeStartDraft({ id, expectedContext: context }),
      result => {
        if (!this.editor.owns(token, true) || !this.ops.live(op)) return false;
        if (!result.ok) return this.ops.failReceipt(result.code);
        if (!receiptMatches(result.expectedContext, context))
          return this.failure('unavailableAccountContext');
        if (options?.reviewOnly && !isReviewReadySavedDraft(result.draft)) {
          this.editor.patch({ state: 'invalid' });
          return false;
        }
        row = result.draft;
        return true;
      },
      () => {
        if (live()) this.failure('error');
      }
    );
    if (!accepted || !row || !this.editor.owns(token, true) || !this.ops.live(op)) return false;
    const restored: SavedDraft = row;
    adoptResumedDraft(this.editor, restored, this.supersede);
    return true;
  }
  async remove(draft: SavedDraft) {
    const op = this.ops.begin();
    const token = this.editor.token();
    const live = () => this.ops.live(op) && this.editor.owns(token);
    const active = this.editor.queue?.getDraft() ?? this.editor.view.active;
    const removingActive = active?.id === draft.id;
    if (removingActive && !(await this.editor.retire(live))) return false;
    if (!live()) return false;
    const settled = removingActive ? (this.editor.retiredDraft ?? draft) : draft;
    this.editor.patch({ state: 'loading' });
    try {
      const result = await deleteFreeStartDraft({
        id: settled.id,
        expectedVersion: settled.version,
      });
      if (result.ok && !live()) {
        acknowledgeDraftDeletion(this.editor, draft.id, token.owner, () => this.reads.invalidate());
        return false;
      }
      if (!live()) return false;
      if (!result.ok) {
        this.editor.terminal = false;
        const code: string = result.code;
        if (code !== 'conflict') return this.ops.failReceipt(code);
        this.editor.patch({ state: 'conflict' });
        return false;
      }
      if (removingActive) this.editor.reset();
      this.editor.patch({
        items: this.editor.view.items.filter(item => item.id !== draft.id),
        state: (!removingActive && this.editor.queue?.getWriteFeedback()) || 'deleted',
      });
      return true;
    } catch {
      if (!live()) return false;
      this.editor.terminal = false;
      return this.failure('error');
    }
  }
  async startAnother(beforeReset?: () => Promise<boolean> | boolean): Promise<boolean> {
    return (await acceptDraftReset(this.editor, this.ops, this.supersede, beforeReset)) !== null;
  }
  /** A restoration reset yields only its own opaque lease; null when refused or superseded. */
  async startRestoration(): Promise<DraftRestorationLease | null> {
    const accepted = await acceptDraftReset(this.editor, this.ops, this.supersede);
    if (!accepted?.barrier) return null;
    const { op, barrier } = accepted;
    return leaseBrowserRestoration(this.editor, () => this.ops.mark() === op.id, barrier);
  }
  releaseContinuation(receipt?: Pick<SavedDraft, 'id' | 'version'> | null) {
    releaseDraftContinuation(receipt);
  }
  async prepareForContinuation(): Promise<SavedDraft | null> {
    const op = this.ops.begin();
    const token = this.editor.token();
    const live = () => this.ops.live(op) && this.editor.owns(token);
    if (this.editor.explicitRequired) return null;
    const snapshot = this.editor.snapshot();
    const queue = this.editor.getQueue();
    if (!snapshot || !queue) return null;
    if (this.editor.savedFingerprint !== snapshot.fingerprint) queue.enqueue(snapshot);
    if (
      !(await queue.drain()) ||
      !live() ||
      !this.editor.owns(token, true) ||
      this.editor.savedFingerprint !== this.editor.fingerprint()
    )
      return null;
    const settled = queue.getDraft();
    if (!settled) return null;
    if (!(await this.editor.retire(live)) || !live()) return null;
    if (!this.editor.owns(token, true)) {
      this.editor.terminal = false;
      this.editor.autoSave();
      return null;
    }
    this.reads.invalidate();
    return prepareDraftContinuation(this.editor, this.ops, op, token, settled);
  }
}
