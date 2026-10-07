import { expect, vi } from 'vitest';
import type { DraftLifecycleCommands } from '../draft-lifecycle-commands';
import type { DraftEditor } from '../draft-lifecycle-editor';
import type { DraftActionMocks, Props } from './account-draft-hook-fixtures';
import { account, saved } from './terminal-draft-fixtures';

/*
 * Pure account-draft auth suite fixture. It imports no editor, command, hook or server-action
 * runtime, so a suite's hoisted mocks and async `vi.mock` factory can load it before the mocked
 * module resolves. Each suite passes its own mocks and the real classes it imported after them.
 */

export const SIGNED_OUT = { ok: false, code: 'authRequired' };
export const CURSOR = { id: saved.id, updatedAt: saved.updatedAt };

/** Fresh suite-owned action mocks on every call; nothing here retains a mock singleton. */
export function createDraftActionMocks(): DraftActionMocks {
  return {
    account: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    list: vi.fn(),
    resume: vi.fn(),
    remove: vi.fn(),
  };
}

/** The mocked server-action exports, bound to exactly one suite's own mocks. */
export function draftActionModule(actions: DraftActionMocks) {
  return {
    getFreeStartDraftAccount: actions.account,
    createFreeStartDraft: actions.create,
    updateFreeStartDraft: actions.update,
    listFreeStartDrafts: actions.list,
    resumeFreeStartDraft: actions.resume,
    deleteFreeStartDraft: actions.remove,
  };
}

/** Real lifecycle classes and receipt defaults that a suite imported after its own mock. */
export type DraftAuthRuntime = Readonly<{
  Editor: typeof DraftEditor;
  Commands: typeof DraftLifecycleCommands;
  configure: (actions: DraftActionMocks) => void;
}>;

/** Shared scaffold: real editor, commands, operations, reads and queue over one suite's mocks. */
export function createAuthSuite(
  actions: DraftActionMocks,
  runtime: DraftAuthRuntime,
  initial: Props
) {
  const { expectedContext } = account;

  /** Default receipts plus an admitted manager list that offers Load more. */
  function reset(): void {
    for (const mock of Object.values(actions)) mock.mockReset();
    runtime.configure(actions);
    actions.list.mockResolvedValue({
      ok: true,
      items: [saved],
      nextCursor: CURSOR,
      expectedContext,
    });
  }

  function harness() {
    const onReset = vi.fn();
    const onResume = vi.fn();
    let props: Props = initial;
    const editor = new runtime.Editor(
      () => ({ ...props, onReset, onResume }),
      () => undefined
    );
    const change = (next: Partial<Props>) => {
      props = { ...props, ...next };
    };
    return { editor, commands: new runtime.Commands(editor), onReset, change };
  }
  type Harness = ReturnType<typeof harness>;

  /** An acknowledged source plus an admitted manager list that offers Load more. */
  async function establish(h: Harness): Promise<void> {
    await expect(h.commands.openSave()).resolves.toBe(true);
    await expect(h.commands.openManage()).resolves.toBe(true);
    expect(h.editor.view).toMatchObject({
      active: saved,
      items: [saved],
      nextCursor: CURSOR,
      intent: 'manage',
      verified: true,
      readAdmitted: true,
      managerBusy: false,
    });
  }

  function expectWrites(creates: number, updates: number): void {
    expect(actions.create).toHaveBeenCalledTimes(creates);
    expect(actions.update).toHaveBeenCalledTimes(updates);
  }

  /** Everything a stale receipt could disturb: presentation, owner, generation and source. */
  const observe = (h: Harness) => ({
    view: h.editor.view,
    account: h.editor.account,
    generation: h.editor.generation,
    queue: h.editor.queue,
    fingerprint: h.editor.savedFingerprint,
    retired: h.editor.retiredDraft,
  });

  return { reset, harness, establish, expectWrites, observe };
}
export type AuthHarness = ReturnType<ReturnType<typeof createAuthSuite>['harness']>;
