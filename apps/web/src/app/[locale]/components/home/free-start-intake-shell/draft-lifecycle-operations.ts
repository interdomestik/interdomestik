import { getFreeStartDraftAccount } from '@/actions/free-start-drafts';
import { releaseOwnedDraftPreparation } from './draft-lifecycle-continuation';
import type { DraftEditor, DraftEditorView } from './draft-lifecycle-editor';
import { draftFailureState, type DraftSaveState } from './types';

export type DraftOperation = Readonly<{ id: number; generation: number }>;

/** Rendered state: a live manager hold masks the raw state without discarding it. */
export const shownState = (view: DraftEditorView): DraftSaveState =>
  view.managerBusy ? 'loading' : view.state;

/** Shows a controlled failure; a required (OTP) intent also rejects for its caller. */
export function failDraft(editor: DraftEditor, code: string, required = false): false {
  editor.patch({ state: draftFailureState(code) });
  if (required) throw new Error('secure_save_intent_failed');
  return false;
}

/**
 * Deliberate-intent ownership for account draft commands. Each deliberate command begins a newer
 * operation that logically supersedes older ones, so a stale discovery or read never acts after a
 * newer resume, reset, removal, opening or owner generation. Only the newest live manager
 * operation holds the shared busy display, and it can release only its own hold. Grants no
 * access: every server call still resolves the authoritative session, owner and tenant.
 */
export class DraftOperations {
  private epoch = 0;
  private holder: DraftOperation | null = null;

  constructor(
    private readonly editor: DraftEditor,
    private readonly reading: () => boolean
  ) {}

  begin(hold = false): DraftOperation {
    releaseOwnedDraftPreparation(this.editor);
    const previous = this.holder;
    const op: DraftOperation = { id: ++this.epoch, generation: this.editor.generation };
    this.release(previous);
    if (hold) {
      this.holder = op;
      this.editor.patch({ managerBusy: true });
    }
    return op;
  }

  async hold<T>(work: (op: DraftOperation) => Promise<T>): Promise<T> {
    const op = this.begin(true);
    try {
      return await work(op);
    } finally {
      this.release(op);
    }
  }

  live(op: DraftOperation): boolean {
    const { editor } = this;
    return !editor.disposed && op.id === this.epoch && op.generation === editor.generation;
  }

  /**
   * Resolves the authoritative account for `op`. A superseded operation (newer intent, owner or
   * tenant generation change, disposal) returns false before accepting a receipt, failing or
   * changing state. true: verified; 'unverified': signed out/unverified; false: stop.
   */
  async discover(op: DraftOperation, required = false): Promise<boolean | 'unverified'> {
    const { editor } = this;
    const token = editor.token();
    const current = () => editor.owns(token) && this.live(op);
    try {
      const result = await getFreeStartDraftAccount();
      if (!current()) return false;
      if (!result.ok) {
        if (result.code === 'authRequired' && !required) {
          editor.patch({ state: 'idle' });
          return 'unverified';
        }
        return failDraft(editor, result.code, required);
      }
      if (!editor.acceptAccount(result))
        return failDraft(editor, 'unavailableAccountContext', required);
      if (!result.emailVerified)
        return required ? failDraft(editor, 'authRequired', true) : 'unverified';
      return true;
    } catch (error) {
      if (error instanceof Error && error.message === 'secure_save_intent_failed') throw error;
      if (!current()) return false;
      return failDraft(editor, 'error', required);
    }
  }

  /** True while a live manager operation other than `except` owns the busy display. */
  held(except?: DraftOperation): boolean {
    const holder = this.holder;
    return holder !== null && holder !== except && this.live(holder);
  }

  mark(): number {
    return this.epoch;
  }

  /** No deliberate operation began since `mark` and none still holds busy. */
  quiet(mark: number): boolean {
    return mark === this.epoch && !this.held();
  }

  /**
   * Leaves loading once no read is pending and no live manager holds busy. A released hold was
   * the newest deliberate operation, so it may settle before a pending prop-identity sync.
   */
  settle(released = false): void {
    const { editor } = this;
    if (this.reading() || this.held() || editor.view.state !== 'loading') return;
    if (released || editor.owns(editor.token())) editor.patch({ state: editor.editedState() });
  }

  release(op: DraftOperation | null): void {
    if (op === null || this.holder !== op) return;
    this.holder = null;
    if (this.editor.view.managerBusy) this.editor.patch({ managerBusy: false });
    this.settle(true);
  }

  dispose(): void {
    this.epoch++;
    this.holder = null;
  }
}
