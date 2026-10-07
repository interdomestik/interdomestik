import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftAccount, type DraftEditorArgs } from './draft-lifecycle-editor';
import { shownState } from './draft-lifecycle-operations';
import { draftFailureState, type SavedDraft } from './types';

const actions = vi.hoisted(() => ({ account: vi.fn(), list: vi.fn(), resume: vi.fn() }));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  listFreeStartDrafts: actions.list,
  resumeFreeStartDraft: actions.resume,
  deleteFreeStartDraft: vi.fn(),
  createFreeStartDraft: vi.fn(),
  updateFreeStartDraft: vi.fn(),
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
const other: DraftAccount = {
  ...account,
  expectedContext: { ...account.expectedContext, ownerUserId: 'owner-b' },
};
const savedB: SavedDraft = { ...saved, id: '33333333-3333-4333-8333-333333333333' };
const listed = (items: SavedDraft[], owner: DraftAccount = account) => ({
  ok: true,
  items,
  nextCursor: null,
  expectedContext: owner.expectedContext,
});
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup({
  owner = account,
  seeded = true,
}: { owner?: DraftAccount | null; seeded?: boolean } = {}) {
  const onResume = vi.fn(),
    onReset = vi.fn();
  let args: DraftEditorArgs = {
    account: owner,
    category: null,
    step: 'category',
    draft: { issueType: '', incidentDate: '', counterparty: '', desiredOutcome: '', summary: '' },
    onReset,
    onResume,
  };
  const editor = new DraftEditor(() => args, vi.fn());
  if (seeded) {
    editor.patch({ items: [saved], readAdmitted: true });
    editor.initialized = true;
  }
  const commands = new DraftLifecycleCommands(editor);
  const switchTo = (next: DraftAccount) => {
    args = { ...args, account: next };
    if (editor.syncAccount()) commands.invalidate();
  };
  return { editor, commands, onResume, onReset, switchTo };
}
beforeEach(() => {
  vi.resetAllMocks();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue({
    ok: true,
    items: [saved],
    nextCursor: null,
    expectedContext: account.expectedContext,
  });
  actions.resume.mockResolvedValue({
    ok: true,
    draft: saved,
    expectedContext: account.expectedContext,
  });
});
describe('manager discovery and later deliberate resume ownership', () => {
  it('marks cached manager rows loading synchronously before account discovery settles', async () => {
    const discovery = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    const { editor, commands } = setup();
    const managing = commands.openManage();
    try {
      expect(shownState(editor.view)).toBe('loading');
    } finally {
      discovery.resolve({ ok: true, ...account });
      await managing;
      commands.dispose();
    }
  });
  it('does not let an older delayed manager discovery replace a later deliberate resume', async () => {
    const discovery = held<unknown>(),
      resuming = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    actions.resume.mockReturnValueOnce(resuming.promise);
    const { editor, commands, onResume } = setup();
    const managing = commands.openManage();
    const resumed = commands.resume(saved.id);
    try {
      await vi.waitFor(() => expect(actions.resume).toHaveBeenCalledOnce());
      discovery.resolve({ ok: true, ...account });
      await managing;
      resuming.resolve({ ok: true, draft: saved, expectedContext: account.expectedContext });
      expect(await resumed).toBe(true);
      expect(onResume).toHaveBeenCalledExactlyOnceWith(saved);
      expect(editor.view.active?.id).toBe(saved.id);
    } finally {
      discovery.resolve({ ok: true, ...account });
      resuming.resolve({ ok: true, draft: saved, expectedContext: account.expectedContext });
      await Promise.all([managing, resumed]);
      commands.dispose();
    }
  });
  it('keeps manager busy when a pending bootstrap list settles during discovery', async () => {
    const discovery = held<unknown>(),
      boot = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    actions.list.mockReturnValueOnce(boot.promise);
    const { editor, commands, onResume } = setup({ seeded: false });
    const booting = commands.bootstrap();
    expect(actions.list).toHaveBeenCalledOnce();
    const managing = commands.openManage();
    boot.resolve(listed([saved]));
    await booting;
    expect(shownState(editor.view)).toBe('loading');
    expect(editor.view.items).toEqual([saved]);
    expect(actions.resume).not.toHaveBeenCalled();
    discovery.resolve({ ok: true, ...account });
    expect(await managing).toBe(true);
    expect(actions.list).toHaveBeenCalledTimes(2);
    expect(editor.view.state).toBe('idle');
    expect(onResume).not.toHaveBeenCalled();
    commands.dispose();
  });
  it('keeps an explicit verified manager list open when background bootstrap returns one draft', async () => {
    const list = held<unknown>();
    actions.list.mockReturnValueOnce(list.promise);
    const { editor, commands, onResume } = setup({ seeded: false });
    editor.patch({ intent: 'manage' });
    const booting = commands.bootstrap();
    list.resolve(listed([saved]));
    try {
      await booting;
      expect(actions.resume).not.toHaveBeenCalled();
      expect(onResume).not.toHaveBeenCalled();
      expect(editor.view).toMatchObject({ intent: 'manage', active: null, items: [saved] });
    } finally {
      commands.dispose();
    }
  });
  it('restores a sole bootstrap draft when no deliberate intent is pending', async () => {
    const { editor, commands, onResume } = setup({ seeded: false });
    await commands.bootstrap();
    expect(onResume).toHaveBeenCalledExactlyOnceWith(saved);
    expect(editor.view.active?.id).toBe(saved.id);
    commands.dispose();
  });
  it('lets a later deliberate resume supersede an in-flight manager list', async () => {
    const list = held<unknown>();
    actions.list.mockReturnValueOnce(list.promise);
    const { editor, commands, onResume } = setup();
    const managing = commands.openManage();
    await vi.waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    expect(await commands.resume(saved.id)).toBe(true);
    list.resolve(listed([saved, savedB]));
    expect(await managing).toBe(false);
    expect(onResume).toHaveBeenCalledExactlyOnceWith(saved);
    expect(editor.view.items).toEqual([saved]);
    expect(editor.view.active?.id).toBe(saved.id);
    commands.dispose();
  });
  it('never lists after startAnother resets during manager discovery', async () => {
    const discovery = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    const { editor, commands, onReset } = setup();
    const managing = commands.openManage();
    expect(await commands.startAnother()).toBe(true);
    discovery.resolve({ ok: true, ...account });
    expect(await managing).toBe(false);
    expect(actions.list).not.toHaveBeenCalled();
    expect(onReset).toHaveBeenCalledOnce();
    expect(editor.view).toMatchObject({ items: [], intent: null, state: 'idle' });
    commands.dispose();
  });
  it('ignores a manager list that settles after startAnother', async () => {
    const list = held<unknown>();
    actions.list.mockReturnValueOnce(list.promise);
    const { editor, commands } = setup();
    const managing = commands.openManage();
    await vi.waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    expect(await commands.startAnother()).toBe(true);
    list.resolve(listed([saved, savedB]));
    expect(await managing).toBe(false);
    expect(editor.view).toMatchObject({ items: [], state: 'idle' });
    commands.dispose();
  });
  it.each([
    { label: 'error', late: { ok: false, code: 'error' } },
    { label: 'receipt', late: { ok: true, ...account } },
  ])('isolates owner B busy from a late owner-A discovery $label', async ({ late }) => {
    const discoveryA = held<unknown>(),
      discoveryB = held<unknown>();
    actions.account.mockReturnValueOnce(discoveryA.promise);
    actions.account.mockReturnValueOnce(discoveryB.promise);
    actions.list.mockResolvedValue(listed([savedB], other));
    const { editor, commands, switchTo } = setup();
    const managingA = commands.openManage();
    switchTo(other);
    const managingB = commands.openManage();
    discoveryA.resolve(late);
    expect(await managingA).toBe(false);
    expect(shownState(editor.view)).toBe('loading');
    expect(editor.account?.expectedContext.ownerUserId).toBe('owner-b');
    discoveryB.resolve({ ok: true, ...other });
    expect(await managingB).toBe(true);
    expect(actions.list).toHaveBeenCalledExactlyOnceWith({
      cursor: null,
      expectedContext: other.expectedContext,
    });
    expect(editor.view.items).toEqual([savedB]);
    commands.dispose();
  });
  it('settles a manager open without listing after unmount', async () => {
    const discovery = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    const { commands } = setup();
    const managing = commands.openManage();
    commands.dispose();
    discovery.resolve({ ok: true, ...account });
    expect(await managing).toBe(false);
    expect(actions.list).not.toHaveBeenCalled();
  });
  it.each([
    { label: 'fails', result: { ok: false, code: 'error' }, lists: 0 },
    { label: 'is accepted', result: { ok: true, ...account }, lists: 1 },
  ])('keeps only the newest overlapping manager open when it $label', async next => {
    const older = held<unknown>(),
      newer = held<unknown>();
    actions.account.mockReturnValueOnce(older.promise);
    actions.account.mockReturnValueOnce(newer.promise);
    const { editor, commands } = setup();
    const first = commands.openManage();
    const second = commands.openManage();
    newer.resolve(next.result);
    expect(await second).toBe(next.lists === 1);
    older.resolve({ ok: true, ...account });
    expect(await first).toBe(false);
    expect(actions.list).toHaveBeenCalledTimes(next.lists);
    expect(editor.view.state).toBe(next.lists ? 'idle' : draftFailureState('error'));
    commands.dispose();
  });
  it('shows a controlled discovery failure without listing', async () => {
    actions.account.mockRejectedValueOnce(new Error('network'));
    const { editor, commands } = setup();
    expect(await commands.openManage()).toBe(false);
    expect(actions.list).not.toHaveBeenCalled();
    expect(editor.view).toMatchObject({ items: [saved], state: draftFailureState('error') });
    commands.dispose();
  });
  it('does not let a hung older discovery wedge a newer manager open', async () => {
    actions.account.mockReturnValueOnce(new Promise(() => {}));
    const { editor, commands } = setup();
    void commands.openManage();
    expect(await commands.openManage()).toBe(true);
    expect(actions.list).toHaveBeenCalledOnce();
    expect(editor.view.state).toBe('idle');
    commands.dispose();
  });
  it('lists after first verified discovery of an initially unknown owner', async () => {
    const { editor, commands } = setup({ owner: null, seeded: false });
    expect(await commands.openManage()).toBe(true);
    expect(actions.list).toHaveBeenCalledExactlyOnceWith({
      cursor: null,
      expectedContext: account.expectedContext,
    });
    expect(editor.view.items).toEqual([saved]);
    commands.dispose();
  });
});
