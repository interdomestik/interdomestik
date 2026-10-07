import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftEditorArgs } from './draft-lifecycle-editor';
import { account, blank, facts, held, saved } from './tests/account-draft-ownership-fixtures';

const actions = vi.hoisted(() => ({
  account: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  createFreeStartDraft: actions.create,
  listFreeStartDrafts: actions.list,
  resumeFreeStartDraft: actions.resume,
  updateFreeStartDraft: actions.update,
  deleteFreeStartDraft: vi.fn(),
}));
const created = { ...saved, id: '44444444-4444-4444-8444-444444444444' };
beforeEach(() => {
  vi.resetAllMocks();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.create.mockImplementation(input =>
    Promise.resolve({ ok: true, draft: { ...created, ...input } })
  );
  actions.update.mockImplementation(input =>
    Promise.resolve({
      ok: true,
      draft: { ...created, ...input, version: input.expectedVersion + 1 },
    })
  );
});
describe('new facts autosave independently from listed account drafts', () => {
  it.each([
    { count: 2, editDuringList: false },
    { count: 1, editDuringList: true },
  ])(
    'creates then updates a new source with $count existing rows, editDuringList=$editDuringList',
    async ({ count, editDuringList }) => {
      const items = Array.from({ length: count }, (_, index) => ({
        ...saved,
        id: index === 0 ? saved.id : '33333333-3333-4333-8333-333333333333',
      }));
      const original = structuredClone(items);
      const listing = held<unknown>();
      const response = {
        ok: true,
        items,
        nextCursor: null,
        expectedContext: account.expectedContext,
      };
      actions.list.mockResolvedValue(response).mockReturnValueOnce(listing.promise);
      let args: DraftEditorArgs = {
        account,
        category: 'vehicle',
        step: 'details',
        draft: editDuringList ? { ...blank } : { ...facts },
        onReset: vi.fn(),
        onResume: vi.fn(),
      };
      const editor = new DraftEditor(() => args, vi.fn());
      const commands = new DraftLifecycleCommands(editor);
      try {
        const booting = commands.bootstrap();
        expect(actions.list).toHaveBeenCalledOnce();
        if (editDuringList) {
          args = { ...args, draft: { ...facts } };
          editor.noteEdit();
        }
        listing.resolve(response);
        await booting;
        await vi.waitFor(() => expect(actions.create).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(editor.view.state).toBe('saved'));
        expect(actions.list).toHaveBeenCalledTimes(editDuringList ? 2 : 1);
        expect(actions.resume).not.toHaveBeenCalled();
        expect(args.onResume).not.toHaveBeenCalled();
        expect(editor.view.active?.id).toBe(created.id);
        expect(editor.view.items).toEqual(original);
        expect(actions.create.mock.calls[0]![0]).toMatchObject({
          issueType: facts.issueType,
          summary: facts.summary,
          counterparty: '',
          category: 'vehicle',
          resumeStep: 'details',
          expectedContext: account.expectedContext,
        });
        args = { ...args, draft: { ...facts, summary: 'Later supported vehicle facts.' } };
        editor.noteEdit();
        editor.autoSave();
        await vi.waitFor(() => expect(actions.update).toHaveBeenCalledOnce());
        await vi.waitFor(() => expect(editor.view.active?.version).toBe(2));
        expect(actions.update.mock.calls[0]![0]).toMatchObject({
          id: created.id,
          expectedVersion: 1,
          expectedContext: account.expectedContext,
          summary: args.draft.summary,
        });
        expect(editor.view.active?.summary).toBe(args.draft.summary);
        expect(editor.view.items).toEqual(original);
        expect(actions.create).toHaveBeenCalledOnce();
        expect(items).toEqual(original);
      } finally {
        commands.dispose();
      }
    }
  );
});

describe('manager listing retains same-fingerprint autosave feedback', () => {
  it.each(['saving', 'error'] as const)(
    'preserves %s and its real retry after list adoption',
    async state => {
      const write = held<unknown>(),
        list = held<unknown>();
      actions.create.mockReturnValueOnce(write.promise);
      actions.list.mockReturnValueOnce(list.promise);
      const args: DraftEditorArgs = {
        account,
        category: 'vehicle',
        step: 'details',
        draft: { ...facts },
        onReset: vi.fn(),
        onResume: vi.fn(),
      };
      const editor = new DraftEditor(() => args, vi.fn());
      const commands = new DraftLifecycleCommands(editor);
      editor.initialized = true;
      editor.patch({ items: [saved], readAdmitted: true });
      try {
        editor.autoSave();
        expect(actions.create).toHaveBeenCalledOnce();
        if (state === 'error') {
          write.resolve({ ok: false, code: 'error' });
          await vi.waitFor(() => expect(editor.view.state).toBe('error'));
        }
        const managing = commands.openManage();
        await vi.waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
        list.resolve({
          ok: true,
          items: [saved],
          nextCursor: null,
          expectedContext: account.expectedContext,
        });
        expect(await managing).toBe(true);
        expect(editor.view.state).toBe(state);
        expect(editor.view.items).toEqual([saved]);
        expect(editor.view.active).toBeNull();
        expect(actions.create).toHaveBeenCalledOnce();
        if (state === 'saving') {
          write.resolve({ ok: true, draft: created });
          await vi.waitFor(() => expect(editor.view.state).toBe('saved'));
        } else {
          actions.create.mockResolvedValueOnce({ ok: true, draft: created });
          expect(await commands.saveChanges()).toBe(true);
          expect(actions.create).toHaveBeenCalledTimes(2);
          expect(actions.create.mock.calls[1]![0]).toEqual(actions.create.mock.calls[0]![0]);
        }
        expect(editor.view.active?.id).toBe(created.id);
        expect(args.onResume).not.toHaveBeenCalled();
      } finally {
        write.resolve({ ok: false, code: 'error' });
        commands.dispose();
      }
    }
  );
});
