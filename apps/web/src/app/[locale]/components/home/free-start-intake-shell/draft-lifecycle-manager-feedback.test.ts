import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftAccount, type DraftEditorArgs } from './draft-lifecycle-editor';
import type { SavedDraft } from './types';
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
const unverified: DraftAccount = { ...account, emailVerified: false };
const listed = {
  ok: true,
  items: [saved],
  nextCursor: null,
  expectedContext: account.expectedContext,
};

function setupRemove() {
  const onReset = vi.fn();
  const args: DraftEditorArgs = {
    account,
    category: 'vehicle',
    draft: saved,
    step: 'preview',
    onReset,
    onResume: vi.fn(),
  };
  const editor = new DraftEditor(() => args, vi.fn());
  editor.initialized = true;
  editor.patch({ active: saved, items: [saved, other], state: 'saved', readAdmitted: true });
  editor.savedFingerprint = editor.fingerprint();
  editor.getQueue();
  return { editor, onReset, commands: new DraftLifecycleCommands(editor) };
}
function setupManage(owner: DraftAccount | null = null) {
  const args: DraftEditorArgs = {
    account: owner,
    category: null,
    draft: { issueType: '', incidentDate: '', counterparty: '', desiredOutcome: '', summary: '' },
    step: 'category',
    onReset: vi.fn(),
    onResume: vi.fn(),
  };
  const editor = new DraftEditor(() => args, vi.fn());
  return { editor, commands: new DraftLifecycleCommands(editor) };
}
function expectNoWrites() {
  expect(actions.create).not.toHaveBeenCalled();
  expect(actions.update).not.toHaveBeenCalled();
}
function expectRetained(editor: DraftEditor) {
  expect(editor.view.active).toEqual(saved);
  expect(editor.view.active?.version).toBe(saved.version);
  expect(editor.view.items).toEqual([saved, other]);
  expect(editor.current().draft).toEqual(saved);
  expect(editor.savedFingerprint).toBe(editor.fingerprint());
  expect(editor.terminal).toBe(false);
  expectNoWrites();
}

beforeEach(() => {
  vi.resetAllMocks();
});
describe('draft deletion failure feedback', () => {
  it.each([
    { label: 'non-active', target: other },
    { label: 'active', target: saved },
  ])('shows conflict and retains facts for a $label conflict', async ({ target }) => {
    actions.remove.mockResolvedValueOnce({ ok: false, code: 'conflict' });
    const { editor, onReset, commands } = setupRemove();
    expect(await commands.remove(target)).toBe(false);
    expect(actions.remove).toHaveBeenCalledExactlyOnceWith({
      id: target.id,
      expectedVersion: target.version,
    });
    expect(editor.view.state).toBe('conflict');
    expect(onReset).not.toHaveBeenCalled();
    expectRetained(editor);
    commands.dispose();
  });
  it.each([
    { label: 'error', outcome: { ok: false, code: 'error' }, state: 'error' },
    {
      label: 'account context',
      outcome: { ok: false, code: 'unavailableAccountContext' },
      state: 'accountContext',
    },
  ])('keeps the ordinary $label failure mapping', async ({ outcome, state }) => {
    actions.remove.mockResolvedValueOnce(outcome);
    const { editor, commands } = setupRemove();
    expect(await commands.remove(other)).toBe(false);
    expect(editor.view.state).toBe(state);
    expectRetained(editor);
    commands.dispose();
  });
  it('keeps the controlled error for a rejected deletion', async () => {
    actions.remove.mockRejectedValueOnce(new Error('network'));
    const { editor, commands } = setupRemove();
    expect(await commands.remove(other)).toBe(false);
    expect(editor.view.state).toBe('error');
    expectRetained(editor);
    commands.dispose();
  });
  it('ignores a late conflict from a superseded deletion', async () => {
    const deletion = held<unknown>();
    actions.remove.mockReturnValueOnce(deletion.promise);
    const { editor, commands } = setupRemove();
    const removing = commands.remove(other);
    expect(await commands.startAnother()).toBe(true);
    deletion.resolve({ ok: false, code: 'conflict' });
    expect(await removing).toBe(false);
    expect(editor.view).toMatchObject({ items: [], active: null, state: 'idle' });
    expectNoWrites();
    commands.dispose();
  });
});
describe('manager open account context', () => {
  it.each([
    { label: 'unknown', owner: null },
    { label: 'cached', owner: account },
  ])('stops quietly before listing for a signed-out $label owner', async ({ owner }) => {
    actions.account.mockResolvedValueOnce({ ok: false, code: 'authRequired' });
    const { editor, commands } = setupManage(owner);
    expect(await commands.openManage()).toBe(false);
    expect(actions.list).not.toHaveBeenCalled();
    expect(editor.account).toEqual(owner ? { ...owner, emailVerified: false } : null);
    expect(editor.view).toMatchObject({
      intent: 'manage',
      state: 'idle',
      managerBusy: false,
      readAdmitted: false,
      items: [],
    });
    expectNoWrites();
    expect(actions.remove).not.toHaveBeenCalled();
    commands.dispose();
  });
  it.each([
    { label: 'unknown', owner: null },
    { label: 'unverified', owner: unverified },
  ])('lists drafts for a signed-in unverified $label owner', async ({ owner }) => {
    actions.account.mockResolvedValueOnce({ ok: true, ...unverified });
    actions.list.mockResolvedValueOnce(listed);
    const { editor, commands } = setupManage(owner);
    expect(await commands.openManage()).toBe(true);
    expect(actions.list).toHaveBeenCalledExactlyOnceWith({
      cursor: null,
      expectedContext: unverified.expectedContext,
    });
    expect(editor.view).toMatchObject({
      intent: 'manage',
      verified: false,
      readAdmitted: true,
      managerBusy: false,
      items: [saved],
    });
    expectNoWrites();
    commands.dispose();
  });
  it('still lists for a verified owner', async () => {
    actions.account.mockResolvedValueOnce({ ok: true, ...account });
    actions.list.mockResolvedValueOnce(listed);
    const { editor, commands } = setupManage();
    expect(await commands.openManage()).toBe(true);
    expect(actions.list).toHaveBeenCalledExactlyOnceWith({
      cursor: null,
      expectedContext: account.expectedContext,
    });
    expect(editor.view).toMatchObject({ verified: true, readAdmitted: true, items: [saved] });
    expectNoWrites();
    commands.dispose();
  });
  it('never lists or restores intent when a superseded discovery reports signed out', async () => {
    const discovery = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    const { editor, commands } = setupManage();
    const managing = commands.openManage();
    expect(await commands.startAnother()).toBe(true);
    discovery.resolve({ ok: false, code: 'authRequired' });
    expect(await managing).toBe(false);
    expect(actions.list).not.toHaveBeenCalled();
    expect(editor.view).toMatchObject({ intent: null, state: 'idle', managerBusy: false });
    expectNoWrites();
    commands.dispose();
  });
});
