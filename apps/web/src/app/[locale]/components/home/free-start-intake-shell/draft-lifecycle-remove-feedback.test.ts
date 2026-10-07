import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftEditorArgs } from './draft-lifecycle-editor';
import type { DraftState, SavedDraft } from './types';
import { account, held, saved } from './tests/terminal-draft-fixtures';

const actions = vi.hoisted(() => ({
  account: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  listFreeStartDrafts: actions.list,
  deleteFreeStartDraft: actions.remove,
  resumeFreeStartDraft: vi.fn(),
  createFreeStartDraft: actions.create,
  updateFreeStartDraft: actions.update,
}));

const other: SavedDraft = { ...saved, id: '33333333-3333-4333-8333-333333333333' };
const edited: DraftState = { ...saved, summary: 'Edited vehicle facts.' };
const editedUpdate = {
  category: 'vehicle',
  counterparty: saved.counterparty,
  desiredOutcome: saved.desiredOutcome,
  incidentDate: saved.incidentDate,
  issueType: saved.issueType,
  resumeStep: 'preview',
  summary: edited.summary,
  id: saved.id,
  expectedVersion: saved.version,
  expectedContext: account.expectedContext,
};
const acked: SavedDraft = {
  ...saved,
  summary: edited.summary,
  version: 2,
  updatedAt: '2026-10-06T13:05:00.000Z',
};

function setup() {
  let draft: DraftState = saved;
  const onReset = vi.fn();
  const current = (): DraftEditorArgs => ({
    account,
    category: 'vehicle',
    draft,
    step: 'preview',
    onReset,
    onResume: vi.fn(),
  });
  const editor = new DraftEditor(current, vi.fn());
  editor.initialized = true;
  editor.patch({ active: saved, items: [saved, other], state: 'saved', readAdmitted: true });
  editor.savedFingerprint = editor.fingerprint();
  const queue = editor.getQueue()!;
  const commands = new DraftLifecycleCommands(editor);
  const edit = () => {
    draft = edited;
    editor.autoSave();
  };
  return { editor, queue, commands, onReset, edit };
}

/** Holds an unrelated deletion while the active row's real queue update settles with `code`. */
async function settleEditBeforeDelete(code: 'error' | 'conflict') {
  const deletion = held<unknown>();
  const update = held<unknown>();
  actions.remove.mockReturnValueOnce(deletion.promise);
  actions.update.mockReturnValueOnce(update.promise);
  const ctx = setup();
  const removing = ctx.commands.remove(other);
  expect(actions.remove).toHaveBeenCalledOnce();
  expect(actions.remove).toHaveBeenCalledWith({ id: other.id, expectedVersion: other.version });
  ctx.edit();
  expect(actions.update).toHaveBeenCalledOnce();
  expect(actions.update).toHaveBeenCalledWith(editedUpdate);
  expect(ctx.editor.view.state).toBe('saving');
  update.resolve({ ok: false, code });
  expect(await ctx.queue.drain()).toBe(false);
  expect(ctx.editor.view.state).toBe(code);
  deletion.resolve({ ok: true });
  expect(await removing).toBe(true);
  // The unrelated deletion must not overwrite the truthful queue state.
  expect(ctx.editor.view.state).toBe(code);
  expect(ctx.editor.view.items).toEqual([saved]);
  expect(ctx.editor.view.active).toEqual(saved);
  expect(ctx.editor.queue).toBe(ctx.queue);
  expect(ctx.queue.getDraft()).toEqual(saved);
  expect(ctx.queue.getWriteFeedback()).toBe(code);
  expect(ctx.editor.current().draft).toEqual(edited);
  expect(actions.update).toHaveBeenCalledOnce();
  expect(actions.create).not.toHaveBeenCalled();
  return ctx;
}

beforeEach(() => {
  vi.resetAllMocks();
  actions.account.mockResolvedValue({ ok: true, ...account });
});
describe('unrelated draft removal feedback', () => {
  it('keeps a failed active update retryable after an unrelated deletion succeeds', async () => {
    const ctx = await settleEditBeforeDelete('error');
    const retry = held<unknown>();
    actions.update.mockReturnValueOnce(retry.promise);
    const retrying = ctx.commands.store();
    expect(actions.update).toHaveBeenCalledTimes(2);
    expect(actions.update).toHaveBeenNthCalledWith(2, editedUpdate);
    expect(ctx.editor.view.state).toBe('saving');
    retry.resolve({ ok: true, draft: acked });
    expect(await retrying).toBe(true);
    expect(ctx.editor.queue).toBe(ctx.queue);
    expect(ctx.editor.view.active).toEqual(acked);
    expect(ctx.editor.view.state).toBe('saved');
    expect(actions.update).toHaveBeenCalledTimes(2);
    expect(actions.create).not.toHaveBeenCalled();
    ctx.commands.dispose();
  });
  it('keeps a conflicted active update frozen after an unrelated deletion succeeds', async () => {
    const ctx = await settleEditBeforeDelete('conflict');
    expect(await ctx.commands.store()).toBe(false);
    expect(ctx.editor.view.state).toBe('conflict');
    expect(ctx.editor.view.active).toEqual(saved);
    expect(actions.update).toHaveBeenCalledOnce();
    expect(actions.create).not.toHaveBeenCalled();
    ctx.commands.dispose();
  });
  it('keeps saving visible until the held active update is acknowledged', async () => {
    const deletion = held<unknown>();
    const update = held<unknown>();
    actions.remove.mockReturnValueOnce(deletion.promise);
    actions.update.mockReturnValueOnce(update.promise);
    const ctx = setup();
    const removing = ctx.commands.remove(other);
    ctx.edit();
    expect(actions.update).toHaveBeenCalledWith(editedUpdate);
    deletion.resolve({ ok: true });
    expect(await removing).toBe(true);
    expect(ctx.editor.view.items).toEqual([saved]);
    expect(ctx.editor.view.state).toBe('saving');
    update.resolve({ ok: true, draft: acked });
    expect(await ctx.queue.drain()).toBe(true);
    expect(ctx.editor.view.active).toEqual(acked);
    expect(ctx.editor.view.state).toBe('saved');
    expect(actions.update).toHaveBeenCalledOnce();
    ctx.commands.dispose();
  });
  it('still shows deleted when an unrelated deletion finds the queue idle', async () => {
    actions.remove.mockResolvedValueOnce({ ok: true });
    const ctx = setup();
    expect(await ctx.commands.remove(other)).toBe(true);
    expect(actions.remove).toHaveBeenCalledWith({ id: other.id, expectedVersion: other.version });
    expect(ctx.editor.view.state).toBe('deleted');
    expect(ctx.editor.view.items).toEqual([saved]);
    expect(ctx.editor.view.active).toEqual(saved);
    expect(actions.update).not.toHaveBeenCalled();
    ctx.commands.dispose();
  });

  it.each([false, true])(
    'retires the queue and shows deleted for an active removal (failed update: %s)',
    async failed => {
      actions.remove.mockResolvedValueOnce({ ok: true });
      const update = held<unknown>();
      actions.update.mockReturnValueOnce(update.promise);
      const ctx = setup();
      if (failed) {
        ctx.edit();
        update.resolve({ ok: false, code: 'error' });
        expect(await ctx.queue.drain()).toBe(false);
        expect(ctx.editor.view.state).toBe('error');
      }
      expect(await ctx.commands.remove(saved)).toBe(true);
      expect(actions.remove).toHaveBeenCalledOnce();
      expect(actions.remove).toHaveBeenCalledWith({ id: saved.id, expectedVersion: saved.version });
      expect(ctx.editor.view.state).toBe('deleted');
      expect(ctx.editor.view.active).toBeNull();
      expect(ctx.editor.queue).toBeNull();
      expect(ctx.onReset).toHaveBeenCalledOnce();
      ctx.commands.dispose();
    }
  );
});
