import {
  deleteFreeStartDraft,
  getFreeStartDraftAccount,
  listFreeStartDrafts,
  resumeFreeStartDraft,
} from '@/actions/free-start-drafts';
import { DraftEditor, receiptMatches, type DraftEditorToken } from './draft-lifecycle-editor';
import { createDraftReadController } from './draft-lifecycle-reads';
import { isReviewReadySavedDraft } from './saved-draft-continuation';
import { draftFailureState, draftFingerprint, type SavedDraft } from './types';

export class DraftLifecycleCommands {
  private readonly reads;
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
        if (!busy && editor.owns(editor.token()) && editor.view.state === 'loading')
          editor.patch({ state: editor.editedState() });
      },
    });
  }
  invalidate() {
    this.reads.invalidate();
  }
  dispose() {
    this.reads.dispose();
    this.editor.dispose();
  }
  private failure(code: string, required = false): false {
    this.editor.patch({ state: draftFailureState(code) });
    if (required) throw new Error('secure_save_intent_failed');
    return false;
  }
  private async discover(required = false): Promise<boolean> {
    const token = this.editor.token();
    try {
      const result = await getFreeStartDraftAccount();
      if (!this.editor.owns(token)) return false;
      if (!result.ok) {
        if (result.code === 'authRequired' && !required) {
          this.editor.patch({ state: 'idle' });
          return false;
        }
        return this.failure(result.code, required);
      }
      if (!this.editor.acceptAccount(result))
        return this.failure('unavailableAccountContext', required);
      if (!result.emailVerified) {
        if (required) return this.failure('authRequired', true);
        return false;
      }
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'secure_save_intent_failed') throw error;
      if (!this.editor.owns(token)) return false;
      return this.failure('error', required);
    }
  }
  async load(cursor: DraftEditor['view']['nextCursor'] = null, required = false): Promise<boolean> {
    const context = this.editor.account?.expectedContext;
    if (!context) return this.failure('authRequired', required);
    const token = this.editor.token();
    this.editor.patch({ state: 'loading' });
    const accepted = await this.reads.run(
      () => listFreeStartDrafts({ cursor, expectedContext: context }),
      result => {
        if (!this.editor.owns(token, true)) return false;
        if (!result.ok) {
          this.failure(result.code);
          return false;
        }
        if (!receiptMatches(result.expectedContext, context)) {
          this.failure('unavailableAccountContext');
          return false;
        }
        this.editor.patch({
          items: cursor ? [...this.editor.view.items, ...result.items] : result.items,
          nextCursor: result.nextCursor,
          readAdmitted: true,
          state: this.editor.editedState(),
        });
        this.editor.initialized = true;
        return true;
      },
      () => {
        if (this.editor.owns(token)) this.failure('error');
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
    this.bootstrapping = token;
    try {
      if (await this.load()) {
        if (
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
    this.editor.patch({ intent: 'save' });
    if (!(await this.discover())) return false;
    return this.store();
  }
  async openManage() {
    this.editor.patch({ intent: 'manage' });
    await this.discover();
    return this.load();
  }
  async onVerified() {
    if (!(await this.discover(true))) throw new Error('secure_save_intent_failed');
    if (this.editor.view.intent === 'manage') await this.load(null, true);
    else await this.store(true);
  }
  async saveChanges() {
    return this.store();
  }
  async resume(id: string, options?: { reviewOnly: boolean }) {
    if (!this.editor.account) await this.discover();
    const context = this.editor.account?.expectedContext;
    if (!context) return this.failure('authRequired');
    const token = this.editor.token();
    if (!(await this.editor.retire()) || !this.editor.owns(token)) return false;
    this.editor.terminal = false;
    this.editor.patch({ state: 'loading' });
    let row: SavedDraft | null = null;
    const accepted = await this.reads.run(
      () => resumeFreeStartDraft({ id, expectedContext: context }),
      result => {
        if (!this.editor.owns(token, true)) return false;
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
        if (this.editor.owns(token)) this.failure('error');
      }
    );
    if (!accepted || !row || !this.editor.owns(token, true)) return false;
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
    const token = this.editor.token();
    const active = this.editor.queue?.getDraft() ?? this.editor.view.active;
    const removingActive = active?.id === draft.id;
    if (removingActive && !(await this.editor.retire())) return false;
    if (!this.editor.owns(token)) return false;
    const settled = removingActive ? (this.editor.retiredDraft ?? draft) : draft;
    this.editor.patch({ state: 'loading' });
    try {
      const result = await deleteFreeStartDraft({
        id: settled.id,
        expectedVersion: settled.version,
      });
      if (!this.editor.owns(token)) return false;
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
      this.editor.terminal = false;
      return this.editor.owns(token) ? this.failure('error') : false;
    }
  }
  async startAnother(beforeReset?: () => Promise<boolean> | boolean) {
    const token = this.editor.token();
    if (!(await this.editor.retire()) || !this.editor.owns(token)) return false;
    if (beforeReset && !(await beforeReset())) {
      this.editor.terminal = false;
      return false;
    }
    this.reads.invalidate();
    this.editor.reset();
    return true;
  }
  releaseContinuation() {
    this.editor.terminal = false;
    this.editor.autoSave();
  }
  async prepareForContinuation(): Promise<SavedDraft | null> {
    const token = this.editor.token();
    const snapshot = this.editor.snapshot();
    const queue = this.editor.getQueue();
    if (!snapshot || !queue) return null;
    if (this.editor.savedFingerprint !== snapshot.fingerprint) queue.enqueue(snapshot);
    if (
      !(await queue.drain()) ||
      !this.editor.owns(token, true) ||
      this.editor.savedFingerprint !== this.editor.fingerprint()
    )
      return null;
    const settled = queue.getDraft();
    if (!(await this.editor.retire()) || !this.editor.owns(token, true)) return null;
    this.reads.invalidate();
    return settled;
  }
}
