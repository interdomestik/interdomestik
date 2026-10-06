import {
  deleteFreeStartDraft,
  listFreeStartDrafts,
  resumeFreeStartDraft,
} from '@/actions/free-start-drafts';
import { DraftEditor, receiptMatches, type DraftEditorToken } from './draft-lifecycle-editor';
import { DraftOperations, failDraft, type DraftOperation } from './draft-lifecycle-operations';
import {
  acknowledgeDraftDeletion,
  prepareDraftContinuation,
  releaseDraftContinuation,
} from './draft-lifecycle-continuation';
import { createDraftReadController, type DraftReadController } from './draft-lifecycle-reads';
import { isReviewReadySavedDraft } from './saved-draft-continuation';
import { draftFingerprint, type SavedDraft } from './types';

type Cursor = DraftEditor['view']['nextCursor'];
export class DraftLifecycleCommands {
  private readonly reads: DraftReadController;
  private readonly ops: DraftOperations;
  private bootstrapping: DraftEditorToken | null = null;
  constructor(readonly editor: DraftEditor) {
    this.reads = createDraftReadController({
      current: () => ({
        ownerUserId: editor.account?.expectedContext.ownerUserId ?? null,
        tenantId: editor.account?.expectedContext.tenantId ?? null,
        editorGeneration: editor.generation,
        fingerprint: editor.fingerprint(),
      }),
      onBusy: busy => {
        if (!busy) this.ops.settle();
      },
    });
    this.ops = new DraftOperations(editor, () => this.reads.isBusy());
  }
  invalidate() {
    this.reads.invalidate();
  }
  dispose() {
    this.ops.dispose();
    this.reads.dispose();
    this.editor.dispose();
  }
  private failure(code: string, required = false): false {
    return failDraft(this.editor, code, required);
  }
  async load(cursor: Cursor = null, required = false, op?: DraftOperation): Promise<boolean> {
    const context = this.editor.account?.expectedContext;
    if (!context) return this.failure('authRequired', required);
    const token = this.editor.token();
    const live = () => !op || this.ops.live(op);
    this.editor.patch({ state: 'loading' });
    const accepted = await this.reads.run(
      () => listFreeStartDrafts({ cursor, expectedContext: context }),
      result => {
        if (!this.editor.owns(token, true) || !live()) return false;
        if (!result.ok) return this.failure(result.code);
        if (!receiptMatches(result.expectedContext, context))
          return this.failure('unavailableAccountContext');
        this.editor.patch({
          items: cursor ? [...this.editor.view.items, ...result.items] : result.items,
          nextCursor: result.nextCursor,
          readAdmitted: true,
          // Raw state stays truthful; a live manager hold masks it through `managerBusy`.
          state: this.editor.editedState(),
        });
        this.editor.initialized = true;
        return true;
      },
      () => {
        if (this.editor.owns(token) && live()) this.failure('error');
      }
    );
    if (!accepted && required && this.editor.owns(token))
      throw new Error('secure_save_intent_failed');
    return accepted;
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
        // Sole-draft restore never competes with a pending or newer deliberate intent.
        if (
          this.ops.quiet(mark) &&
          this.editor.view.intent !== 'manage' &&
          this.editor.view.items.length === 1 &&
          !this.editor.view.active &&
          !Object.values(this.editor.current().draft).some(Boolean)
        ) {
          await this.resume(this.editor.view.items[0]!.id);
        }
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
      if (required && this.editor.owns(token)) throw new Error('secure_save_intent_failed');
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
    // Checked again after retirement, before any receipt or adoption.
    const live = () => this.ops.live(op) && this.editor.owns(token);
    if (!(await this.editor.retire(live)) || !live()) return false;
    this.editor.terminal = false;
    this.editor.patch({ state: 'loading' });
    let row: SavedDraft | null = null;
    const accepted = await this.reads.run(
      () => resumeFreeStartDraft({ id, expectedContext: context }),
      result => {
        if (!this.editor.owns(token, true) || !this.ops.live(op)) return false;
        if (!result.ok) return this.failure(result.code);
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
    this.editor.generation++;
    this.reads.invalidate();
    this.editor.savedFingerprint = draftFingerprint(
      restored.category,
      restored,
      restored.resumeStep
    );
    this.editor.patch({ active: restored, intent: null, state: 'saved' });
    this.editor.current().onResume(restored);
    this.editor.initialized = true;
    this.editor.explicitRequired = false;
    this.editor.getQueue()?.adopt(restored);
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
        return this.failure(result.code);
      }
      if (removingActive) this.editor.reset();
      this.editor.patch({
        items: this.editor.view.items.filter(item => item.id !== draft.id),
        state: 'deleted',
      });
      return true;
    } catch {
      if (!live()) return false;
      this.editor.terminal = false;
      return this.failure('error');
    }
  }
  async startAnother(beforeReset?: () => Promise<boolean> | boolean) {
    const op = this.ops.begin();
    const token = this.editor.token();
    const live = () => this.ops.live(op) && this.editor.owns(token);
    if (!(await this.editor.retire(live)) || !live()) return false;
    const accepted = beforeReset ? await beforeReset() : true;
    if (!live()) return false;
    if (!accepted) {
      this.editor.terminal = false;
      return false;
    }
    this.reads.invalidate();
    this.editor.reset();
    return true;
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
