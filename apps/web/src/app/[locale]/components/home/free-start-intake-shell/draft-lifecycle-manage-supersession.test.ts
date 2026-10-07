import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftAccount, type DraftEditorArgs } from './draft-lifecycle-editor';
import { shownState } from './draft-lifecycle-operations';
import { held } from './tests/terminal-draft-fixtures';
import { draftFailureState, type DraftState, type SavedDraft } from './types';
const actions = vi.hoisted(() => ({
  account: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  create: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  listFreeStartDrafts: actions.list,
  resumeFreeStartDraft: actions.resume,
  createFreeStartDraft: actions.create,
  updateFreeStartDraft: actions.update,
  deleteFreeStartDraft: vi.fn(),
}));
const account: DraftAccount = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
const tenantB: DraftAccount = {
  ...account,
  expectedContext: { ...account.expectedContext, tenantId: 'tenant_mk' },
};
const facts: DraftState = {
  issueType: 'collision',
  incidentDate: '',
  counterparty: 'Insurer',
  desiredOutcome: '',
  summary: 'Bounded vehicle facts.',
};
const newer: DraftState = { ...facts, summary: 'Newer vehicle facts.' };
const saved: SavedDraft = {
  ...facts,
  category: 'vehicle',
  resumeStep: 'details',
  id: '22222222-2222-4222-8222-222222222222',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-06T13:00:00.000Z',
  updatedAt: '2026-10-06T13:00:00.000Z',
};
const savedB: SavedDraft = { ...saved, id: '33333333-3333-4333-8333-333333333333' };
const listed = (items: SavedDraft[]) => ({
  ok: true,
  items,
  nextCursor: null,
  expectedContext: account.expectedContext,
});
type Held = { resolve: (value: unknown) => void; reject: (error: unknown) => void };
type Seed = 'listed' | 'active' | 'fresh' | 'none';
function setup(seed: Seed = 'listed', owner: DraftAccount | null = account) {
  const onResume = vi.fn(),
    onReset = vi.fn();
  let args: DraftEditorArgs = {
    account: owner,
    category: 'vehicle',
    step: 'details',
    draft: facts,
    onReset,
    onResume,
  };
  const editor = new DraftEditor(() => args, vi.fn());
  if (seed === 'listed') editor.patch({ items: [saved], readAdmitted: true });
  if (seed === 'active') {
    editor.patch({ active: saved, state: 'saved' });
    editor.savedFingerprint = editor.fingerprint();
  }
  editor.initialized = seed !== 'none';
  const commands = new DraftLifecycleCommands(editor);
  const change = (next: Partial<DraftEditorArgs>, edit = true) => {
    args = { ...args, ...next };
    if (editor.syncAccount()) commands.invalidate();
    if (!edit) return;
    editor.noteEdit();
    editor.autoSave();
  };
  return { editor, commands, onResume, onReset, change };
}
beforeEach(() => {
  vi.resetAllMocks();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue(listed([saved]));
  actions.resume.mockResolvedValue({
    ok: true,
    draft: saved,
    expectedContext: account.expectedContext,
  });
});
describe('superseded manager discovery', () => {
  it.each([
    { label: 'error', settle: (d: Held) => d.resolve({ ok: false, code: 'error' }) },
    { label: 'rejection', settle: (d: Held) => d.reject(new Error('network')) },
    {
      label: 'changed receipt',
      settle: (d: Held) => d.resolve({ ok: true, ...account, emailVerified: false }),
    },
  ])('ignores an older same-owner $label after a newer open succeeds', async ({ settle }) => {
    const older = held<unknown>();
    actions.account.mockReturnValueOnce(older.promise);
    const { editor, commands } = setup();
    const first = commands.openManage();
    expect(await commands.openManage()).toBe(true);
    settle(older);
    expect(await first).toBe(false);
    expect(actions.list).toHaveBeenCalledOnce();
    expect(editor.account?.emailVerified).toBe(true);
    expect(editor.view).toMatchObject({
      items: [saved],
      managerBusy: false,
      state: 'idle',
      verified: true,
    });
    commands.dispose();
  });
  it('drops an owner-A discovery after a same-facts tenant switch', async () => {
    const discovery = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    const { editor, commands, change, onReset } = setup();
    const managing = commands.openManage();
    expect(shownState(editor.view)).toBe('loading');
    change({ account: tenantB }, false);
    expect(shownState(editor.view)).toBe('idle');
    discovery.resolve({ ok: true, ...account });
    expect(await managing).toBe(false);
    expect(actions.list).not.toHaveBeenCalled();
    expect(onReset).toHaveBeenCalledOnce();
    expect(editor.account?.expectedContext).toEqual(tenantB.expectedContext);
    expect(editor.view).toMatchObject({ items: [], intent: null, managerBusy: false });
    commands.dispose();
  });
  it('denies a stale list receipt after edits, releasing busy and keeping the edit', async () => {
    const discovery = held<unknown>(),
      list = held<unknown>(),
      write = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    actions.list.mockReturnValueOnce(list.promise);
    actions.create.mockReturnValueOnce(write.promise);
    actions.update.mockImplementation(input =>
      Promise.resolve({ ok: true, draft: { ...savedB, ...input, version: 2 } })
    );
    const { editor, commands, change, onReset } = setup();
    const managing = commands.openManage();
    change({ draft: newer });
    discovery.resolve({ ok: true, ...account });
    await vi.waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    const latest = { ...newer, summary: 'Edited while listing.' };
    change({ draft: latest });
    expect(shownState(editor.view)).toBe('loading');
    list.resolve(listed([saved, savedB]));
    expect(await managing).toBe(false);
    expect(editor.view.items).toEqual([saved]);
    expect(editor.view.managerBusy).toBe(false);
    await vi.waitFor(() => expect(shownState(editor.view)).not.toBe('loading'));
    expect(editor.current().draft).toEqual(latest);
    expect(onReset).not.toHaveBeenCalled();
    expect(actions.create).toHaveBeenCalledOnce();
    write.resolve({ ok: true, draft: { ...savedB, ...newer } });
    await vi.waitFor(() => expect(editor.view.active?.version).toBe(2));
    expect(actions.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: savedB.id,
        expectedVersion: 1,
        expectedContext: account.expectedContext,
        summary: latest.summary,
      })
    );
    expect(editor.view.active?.summary).toBe(latest.summary);
    expect(editor.view.items).toEqual([saved]);
    expect(editor.view.state).toBe('saved');
    expect(actions.create).toHaveBeenCalledOnce();
    commands.dispose();
  });
  it('stays busy over a failed bootstrap list, then shows its own failure', async () => {
    const discovery = held<unknown>(),
      boot = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    actions.list.mockReturnValueOnce(boot.promise);
    const { editor, commands } = setup('none');
    const booting = commands.bootstrap();
    await vi.waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    const managing = commands.openManage();
    boot.resolve({ ok: false, code: 'error' });
    await booting;
    expect(editor.view.state).toBe(draftFailureState('error'));
    expect(shownState(editor.view)).toBe('loading');
    discovery.resolve({ ok: false, code: 'error' });
    expect(await managing).toBe(false);
    expect(actions.list).toHaveBeenCalledOnce();
    expect(editor.view.managerBusy).toBe(false);
    expect(shownState(editor.view)).toBe(draftFailureState('error'));
    commands.dispose();
  });
  it('rejects a superseded verification without false success or state change', async () => {
    const discovery = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    const { editor, commands } = setup();
    editor.patch({ intent: 'save' });
    const verifying = commands.onVerified();
    expect(await commands.openManage()).toBe(true);
    discovery.resolve({ ok: false, code: 'error' });
    await expect(verifying).rejects.toThrow('secure_save_intent_failed');
    expect(editor.view).toMatchObject({ intent: 'manage', managerBusy: false, state: 'idle' });
    expect(actions.create).not.toHaveBeenCalled();
    commands.dispose();
  });
  it('completes a current first verification of an initially unknown owner', async () => {
    const { editor, commands } = setup('none', null);
    editor.patch({ intent: 'manage' });
    await expect(commands.onVerified()).resolves.toBeUndefined();
    expect(actions.list).toHaveBeenCalledExactlyOnceWith({
      cursor: null,
      expectedContext: account.expectedContext,
    });
    expect(editor.account?.expectedContext).toEqual(account.expectedContext);
    expect(editor.view.items).toEqual([saved]);
    commands.dispose();
  });
});
describe('superseded retirement ownership', () => {
  it('keeps newer manager busy and the latest ack after a late older retirement', async () => {
    const update = held<unknown>(),
      discovery = held<unknown>();
    actions.update.mockReturnValueOnce(update.promise);
    actions.account.mockReturnValueOnce(discovery.promise);
    const { editor, commands, change } = setup('active');
    change({ draft: newer });
    expect(actions.update).toHaveBeenCalledOnce();
    const resuming = commands.resume(savedB.id);
    const managing = commands.openManage();
    update.resolve({ ok: true, draft: { ...saved, ...newer, version: 2 } });
    expect(await resuming).toBe(false);
    expect(actions.resume).not.toHaveBeenCalled();
    expect(editor.view.managerBusy).toBe(true);
    expect(editor.terminal).toBe(false);
    expect(editor.view.active?.version).toBe(2);
    discovery.resolve({ ok: true, ...account });
    expect(await managing).toBe(true);
    expect(editor.view.managerBusy).toBe(false);
    const newest = { ...newer, summary: 'Newest vehicle facts.' };
    actions.update.mockResolvedValueOnce({ ok: true, draft: { ...saved, ...newest, version: 3 } });
    change({ draft: newest });
    expect(actions.update).toHaveBeenCalledTimes(2);
    expect(actions.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: saved.id, expectedVersion: 2, summary: newest.summary })
    );
    expect(actions.create).not.toHaveBeenCalled();
    commands.dispose();
  });
  it('lets only the newer of two overlapping resumes retire, read and adopt', async () => {
    const update = held<unknown>();
    actions.update.mockReturnValueOnce(update.promise);
    actions.resume.mockResolvedValueOnce({
      ok: true,
      draft: savedB,
      expectedContext: account.expectedContext,
    });
    const { editor, commands, change, onResume } = setup('active');
    change({ draft: newer });
    const older = commands.resume(saved.id);
    const newest = commands.resume(savedB.id);
    update.resolve({ ok: true, draft: { ...saved, ...newer, version: 2 } });
    expect(await older).toBe(false);
    expect(await newest).toBe(true);
    expect(actions.resume).toHaveBeenCalledExactlyOnceWith({
      id: savedB.id,
      expectedContext: account.expectedContext,
    });
    expect(onResume).toHaveBeenCalledExactlyOnceWith(savedB);
    expect(editor.terminal).toBe(false);
    expect(editor.queue?.getDraft()?.id).toBe(savedB.id);
    commands.dispose();
  });
  it('surfaces a current retirement failure and replays the original create', async () => {
    const create = held<unknown>();
    actions.create.mockReturnValueOnce(create.promise);
    const { editor, commands } = setup('fresh');
    editor.autoSave();
    expect(actions.create).toHaveBeenCalledOnce();
    const resuming = commands.resume(savedB.id);
    create.reject(new Error('network'));
    expect(await resuming).toBe(false);
    expect(actions.resume).not.toHaveBeenCalled();
    expect(editor.view.state).toBe('error');
    expect(editor.terminal).toBe(false);
    actions.create.mockResolvedValueOnce({ ok: true, draft: saved });
    expect(await commands.saveChanges()).toBe(true);
    expect(actions.create).toHaveBeenCalledTimes(2);
    expect(actions.create.mock.calls[1]?.[0]).toEqual(actions.create.mock.calls[0]?.[0]);
    expect(editor.view).toMatchObject({ active: saved, state: 'saved' });
    commands.dispose();
  });
});
