import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftAccount, type DraftEditorArgs } from './draft-lifecycle-editor';
import { isDraftContinuationCurrent } from './draft-lifecycle-continuation';
import type { SavedDraft } from './types';
const actions = vi.hoisted(() => ({
  account: vi.fn(),
  list: vi.fn(),
  remove: vi.fn(),
  resume: vi.fn(),
  update: vi.fn(),
  create: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  listFreeStartDrafts: actions.list,
  deleteFreeStartDraft: actions.remove,
  resumeFreeStartDraft: actions.resume,
  createFreeStartDraft: actions.create,
  updateFreeStartDraft: actions.update,
}));
const account: DraftAccount = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
const saved: SavedDraft = {
  category: 'vehicle',
  resumeStep: 'preview',
  issueType: 'collision',
  incidentDate: '2026-10-05',
  counterparty: 'Insurer',
  desiredOutcome: 'repair',
  summary: 'Bounded vehicle facts.',
  id: '22222222-2222-4222-8222-222222222222',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-06T13:00:00.000Z',
  updatedAt: '2026-10-06T13:00:00.000Z',
};
const other: SavedDraft = { ...saved, id: '33333333-3333-4333-8333-333333333333' };
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  let args: DraftEditorArgs = {
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
  const commands = new DraftLifecycleCommands(editor);
  const change = (next: Partial<DraftEditorArgs>) => {
    args = { ...args, ...next };
    if (editor.syncAccount()) commands.invalidate();
    editor.noteEdit();
    editor.autoSave();
  };
  return { editor, commands, change };
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
  actions.resume.mockResolvedValue({
    ok: true,
    draft: other,
    expectedContext: account.expectedContext,
  });
});
describe('attempt-specific prepared draft ownership', () => {
  it('distinguishes repeated preparations of the same draft/version and ignores the old release', async () => {
    const { editor, commands } = setup();
    const first = await commands.prepareForContinuation();
    expect(first).toEqual(saved);
    const second = await commands.prepareForContinuation();
    expect(second).toEqual(saved);
    expect(second).not.toBe(first);
    expect(isDraftContinuationCurrent(first!)).toBe(false);
    commands.releaseContinuation(first);
    expect(editor.terminal).toBe(true);
    expect(isDraftContinuationCurrent(second!)).toBe(true);
    commands.releaseContinuation(second);
    expect(editor.terminal).toBe(false);
    expect(editor.view.active).toEqual(saved);
    expect(actions.create).not.toHaveBeenCalled();
    commands.dispose();
  });
  it('lets a newer manager own busy and restore editing without an old preparation release', async () => {
    const discovery = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    const { editor, commands } = setup();
    const receipt = await commands.prepareForContinuation();
    const managing = commands.openManage();
    expect(editor.terminal).toBe(false);
    expect(editor.view.managerBusy).toBe(true);
    commands.releaseContinuation(receipt);
    expect(editor.view.managerBusy).toBe(true);
    expect(isDraftContinuationCurrent(receipt!)).toBe(false);
    discovery.resolve({ ok: true, ...account });
    expect(await managing).toBe(true);
    expect(editor.terminal).toBe(false);
    commands.dispose();
  });
  it('denies a null handoff after edits during retirement and preserves current editable facts', async () => {
    const { editor, commands, change } = setup();
    const original = editor.retire.bind(editor),
      retirement = held<void>();
    vi.spyOn(editor, 'retire').mockImplementation(async live => {
      const safe = await original(live);
      await retirement.promise;
      return safe;
    });
    const preparing = commands.prepareForContinuation();
    await vi.waitFor(() => expect(editor.queue).toBeNull());
    const latest = { ...saved, summary: 'Facts edited during retirement.' };
    change({ draft: latest });
    actions.update.mockResolvedValue({ ok: true, draft: { ...latest, version: 2 } });
    retirement.resolve();
    expect(await preparing).toBeNull();
    expect(editor.terminal).toBe(false);
    expect(editor.current().draft).toEqual(latest);
    expect(actions.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({ id: saved.id, expectedVersion: 1, summary: latest.summary })
    );
    commands.releaseContinuation(null);
    expect(actions.create).not.toHaveBeenCalled();
    commands.dispose();
  });
  it('invalidates a lease on disposal without reopening the retired source', async () => {
    const { editor, commands } = setup();
    const receipt = await commands.prepareForContinuation();
    commands.dispose();
    commands.releaseContinuation(receipt);
    expect(isDraftContinuationCurrent(receipt!)).toBe(false);
    expect(editor.disposed).toBe(true);
    expect(actions.create).not.toHaveBeenCalled();
    expect(actions.update).not.toHaveBeenCalled();
  });
  it('releases old owner terminal on account replacement without admitting old source facts', async () => {
    const { editor, commands, change } = setup();
    const receipt = await commands.prepareForContinuation();
    const ownerB = {
      ...account,
      expectedContext: { ownerUserId: 'owner-b', tenantId: 'tenant_mk' },
    };
    change({ account: ownerB });
    commands.releaseContinuation(receipt);
    expect(editor.terminal).toBe(false);
    expect(editor.view.active).toBeNull();
    expect(editor.awaitingReset).toBe(true);
    expect(isDraftContinuationCurrent(receipt!)).toBe(false);
    expect(actions.create).not.toHaveBeenCalled();
    expect(actions.update).not.toHaveBeenCalled();
    commands.dispose();
  });
});
describe('confirmed delete acknowledgment under a later intent', () => {
  it('preserves local facts while blocking automatic reuse of an acknowledged-deleted active source', async () => {
    const deletion = held<unknown>(),
      discovery = held<unknown>();
    actions.remove.mockReturnValueOnce(deletion.promise);
    actions.account.mockReturnValueOnce(discovery.promise);
    const { editor, commands, change } = setup();
    const removing = commands.remove(saved);
    await vi.waitFor(() => expect(actions.remove).toHaveBeenCalledOnce());
    const managing = commands.openManage();
    deletion.resolve({ ok: true });
    expect(await removing).toBe(false);
    expect(editor.view.active).toBeNull();
    expect(editor.view.items).toEqual([other]);
    expect(editor.current().draft).toEqual(saved);
    expect(editor.current().onReset).not.toHaveBeenCalled();
    expect(editor.explicitRequired).toBe(true);
    commands.releaseContinuation(null);
    change({ draft: { ...saved, summary: 'Local facts kept after deletion.' } });
    expect(await commands.prepareForContinuation()).toBeNull();
    expect(actions.create).not.toHaveBeenCalled();
    expect(actions.update).not.toHaveBeenCalled();
    discovery.resolve({ ok: true, ...account });
    expect(await managing).toBe(false);
    expect(editor.view.state).toBe('deleted');
    commands.dispose();
  });
  it('keeps a newer different source and its continuation retirement intact after a physical delete', async () => {
    const deletion = held<unknown>();
    actions.remove.mockReturnValueOnce(deletion.promise);
    const { editor, commands } = setup();
    const removing = commands.remove(saved);
    await vi.waitFor(() => expect(actions.remove).toHaveBeenCalledOnce());
    expect(await commands.resume(other.id)).toBe(true);
    const receipt = await commands.prepareForContinuation();
    expect(receipt).toEqual(other);
    deletion.resolve({ ok: true });
    expect(await removing).toBe(false);
    expect(editor.view.active).toEqual(other);
    expect(editor.terminal).toBe(true);
    expect(isDraftContinuationCurrent(receipt!)).toBe(true);
    expect(editor.view.items).toEqual([other]);
    commands.releaseContinuation(receipt);
    expect(editor.terminal).toBe(false);
    commands.dispose();
  });
});
