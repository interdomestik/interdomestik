import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftEditorArgs } from './draft-lifecycle-editor';
import { account, held, saved } from './tests/terminal-draft-fixtures';
const actions = vi.hoisted(() => ({
  account: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  remove: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  createFreeStartDraft: actions.create,
  updateFreeStartDraft: actions.update,
  listFreeStartDrafts: actions.list,
  resumeFreeStartDraft: actions.resume,
  deleteFreeStartDraft: actions.remove,
}));
const drain = () =>
  Array.from({ length: 25 }).reduce<Promise<void>>(
    chain => chain.then(() => undefined),
    Promise.resolve()
  );
function setup() {
  let args: DraftEditorArgs = {
    account,
    category: 'vehicle',
    step: 'preview',
    draft: {
      issueType: 'collision',
      incidentDate: saved.incidentDate!,
      counterparty: 'Insurer',
      desiredOutcome: 'repair',
      summary: saved.summary!,
    },
    onReset: vi.fn(),
    onResume: vi.fn(),
  };
  const editor = new DraftEditor(
    () => args,
    () => undefined
  );
  const commands = new DraftLifecycleCommands(editor);
  const edit = () => {
    args = { ...args, draft: { ...args.draft, summary: 'Retained failed edit.' } };
  };
  const expire = async () => {
    actions.account.mockResolvedValueOnce({ ok: false, code: 'authRequired' });
    await expect(commands.openManage()).resolves.toBe(false);
  };
  return { editor, commands, edit, expire };
}
beforeEach(() => {
  for (const mock of Object.values(actions)) mock.mockReset();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.create.mockResolvedValue({ ok: true, draft: saved });
  actions.list.mockResolvedValue({
    ok: true,
    items: [saved],
    nextCursor: null,
    expectedContext: account.expectedContext,
  });
});
describe('expired admission terminal settlement', () => {
  it.each(['conflict', 'unavailable'])(
    'retains known update %s through verification without automatic retry',
    async code => {
      const h = setup();
      await h.commands.openSave();
      h.edit();
      actions.update.mockResolvedValueOnce({ ok: false, code });
      await expect(h.commands.openSave()).resolves.toBe(false);
      const original = actions.update.mock.calls[0][0];
      await h.expire();
      await h.commands.onVerified();
      expect(h.editor.view.state).toBe(code === 'conflict' ? 'conflict' : 'error');
      h.editor.autoSave();
      await drain();
      expect(actions.update).toHaveBeenCalledTimes(1);
      expect(h.editor.current().draft.summary).toBe('Retained failed edit.');
      if (code === 'conflict') {
        await expect(h.commands.openSave()).resolves.toBe(false);
        expect(actions.update).toHaveBeenCalledTimes(1);
        expect(h.editor.view.state).toBe('conflict');
      } else {
        actions.update.mockResolvedValueOnce({
          ok: true,
          draft: { ...saved, version: 2, summary: 'Retained failed edit.' },
        });
        await expect(h.commands.openSave()).resolves.toBe(true);
        expect(actions.update.mock.calls[1][0]).toEqual(original);
      }
      expect(actions.create).toHaveBeenCalledTimes(1);
    }
  );
  it('never restores or automatically recreates a source physically deleted during expiry', async () => {
    const h = setup();
    await h.commands.openSave();
    const deletion = held<unknown>();
    actions.remove.mockReturnValueOnce(deletion.promise);
    const removing = h.commands.remove(saved);
    await drain();
    expect(actions.remove).toHaveBeenCalledExactlyOnceWith({ id: saved.id, expectedVersion: 1 });
    await h.expire();
    deletion.resolve({ ok: true });
    await expect(removing).resolves.toBe(false);
    actions.list.mockResolvedValue({
      ok: true,
      items: [],
      nextCursor: null,
      expectedContext: account.expectedContext,
    });
    await h.commands.onVerified();
    h.editor.autoSave();
    await drain();
    expect(h.editor.view.active).toBeNull();
    expect(h.editor.view.items).toEqual([]);
    expect(h.editor.current().draft.summary).toBe(saved.summary);
    expect(h.editor.current().onReset).not.toHaveBeenCalled();
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.update).not.toHaveBeenCalled();
  });
});
