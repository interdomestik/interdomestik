import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftEditorArgs } from './draft-lifecycle-editor';
import type { SavedDraft } from './types';
import { account, held, saved } from './tests/terminal-draft-fixtures';

const actions = vi.hoisted(() => ({ account: vi.fn(), list: vi.fn(), remove: vi.fn() }));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  listFreeStartDrafts: actions.list,
  deleteFreeStartDraft: actions.remove,
  resumeFreeStartDraft: vi.fn(),
  createFreeStartDraft: vi.fn(),
  updateFreeStartDraft: vi.fn(),
}));

const other: SavedDraft = { ...saved, id: '33333333-3333-4333-8333-333333333333' };
function setup() {
  const args: DraftEditorArgs = {
    account,
    category: 'vehicle',
    draft: saved,
    step: 'preview',
    onReset: vi.fn(),
    onResume: vi.fn(),
  };
  const editor = new DraftEditor(() => args, vi.fn());
  editor.initialized = true;
  editor.patch({ active: saved, items: [saved, other], state: 'saved', readAdmitted: true });
  editor.savedFingerprint = editor.fingerprint();
  editor.getQueue();
  return { editor, commands: new DraftLifecycleCommands(editor) };
}
beforeEach(() => {
  vi.resetAllMocks();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue({
    ok: true,
    items: [saved, other],
    nextCursor: null,
    expectedContext: account.expectedContext,
  });
});
describe('late terminal-release ownership', () => {
  it.each(['failure', 'rejection'])(
    'keeps a newer accepted continuation retired after an old removal %s',
    async kind => {
      const deletion = held<unknown>();
      actions.remove.mockReturnValueOnce(deletion.promise);
      const { editor, commands } = setup();
      const removing = commands.remove(other);
      expect(actions.remove).toHaveBeenCalledOnce();
      expect(await commands.prepareForContinuation()).toEqual(saved);
      expect(editor.terminal).toBe(true);
      if (kind === 'failure') deletion.resolve({ ok: false, code: 'error' });
      else deletion.reject(new Error('network'));
      expect(await removing).toBe(false);
      expect(editor.terminal).toBe(true);
      expect(editor.view.active).toEqual(saved);
      expect(editor.current().draft).toEqual(saved);
      commands.dispose();
    }
  );
  it.each([false, true])(
    'does not release the newer reset retirement when an old handoff returns %s',
    async value => {
      const older = held<boolean>(),
        newer = held<boolean>();
      const oldHandoff = vi.fn(() => older.promise),
        newHandoff = vi.fn(() => newer.promise);
      const { editor, commands } = setup();
      const first = commands.startAnother(oldHandoff);
      await vi.waitFor(() => expect(oldHandoff).toHaveBeenCalledOnce());
      const second = commands.startAnother(newHandoff);
      await vi.waitFor(() => expect(newHandoff).toHaveBeenCalledOnce());
      older.resolve(value);
      expect(await first).toBe(false);
      expect(editor.terminal).toBe(true);
      expect(editor.current().onReset).not.toHaveBeenCalled();
      newer.resolve(false);
      expect(await second).toBe(false);
      expect(editor.terminal).toBe(false);
      expect(editor.view.active).toEqual(saved);
      commands.dispose();
    }
  );
});
