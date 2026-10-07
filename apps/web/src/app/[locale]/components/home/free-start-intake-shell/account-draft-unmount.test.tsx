import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { freeStartDraftPayloadSchema as schema } from '@/lib/validators/free-start-draft';
import {
  configureDefaultActions,
  facts,
  QUIET_MS,
  settle,
  setup,
  type Lifecycle,
} from './tests/account-draft-hook-fixtures';
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

const context = account.expectedContext;
const writes = () => actions.create.mock.calls.length + actions.update.mock.calls.length;
const oversized = 'x'.repeat(20_000);

async function acknowledged(): Promise<Lifecycle> {
  const lifecycle = setup();
  await settle();
  lifecycle.type('Acknowledged vehicle facts.');
  await settle(QUIET_MS);
  expect(actions.create).toHaveBeenCalledOnce();
  expect(lifecycle.hook.result.current.hasUnsavedChanges).toBe(false);
  return lifecycle;
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  configureDefaultActions(actions);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('account draft soft unmount', () => {
  it('admits exactly the latest create once when unmounted inside the quiet window', async () => {
    const { hook, type } = setup();
    await settle();
    for (const summary of ['Leaving vehicle facts x.', 'Leaving vehicle facts xx.']) {
      type(summary);
      await settle(100);
    }
    type('Latest vehicle facts before leaving.');
    expect(writes()).toBe(0);
    hook.unmount();
    await settle(QUIET_MS * 2);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.create.mock.calls[0]?.[0]).toMatchObject({
      category: 'vehicle',
      expectedContext: context,
      resumeStep: 'details',
      summary: 'Latest vehicle facts before leaving.',
    });
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('admits exactly the latest same-id update once after an acknowledged create', async () => {
    const { hook, type } = await acknowledged();
    type('Edited vehicle facts before leaving.');
    await settle(100);
    hook.unmount();
    await settle(QUIET_MS * 2);
    expect(actions.update).toHaveBeenCalledOnce();
    expect(actions.update.mock.calls[0]?.[0]).toMatchObject({
      id: saved.id,
      expectedVersion: 1,
      expectedContext: context,
      summary: 'Edited vehicle facts before leaving.',
    });
    expect(actions.create).toHaveBeenCalledOnce();
  });

  it('writes the newest edit only after an older held update ACKs, on its version', async () => {
    const { hook, type } = await acknowledged();
    const older = held<unknown>();
    actions.update.mockReturnValueOnce(older.promise);
    type('Older edit of the vehicle facts.');
    await settle(QUIET_MS);
    expect(actions.update).toHaveBeenCalledOnce();
    type('Newest edit of the vehicle facts.');
    await settle(100);
    hook.unmount();
    await settle(QUIET_MS);
    expect(actions.update).toHaveBeenCalledOnce();
    older.resolve({ ok: true, draft: { ...saved, version: 2 } });
    await settle();
    expect(actions.update).toHaveBeenCalledTimes(2);
    expect(actions.update.mock.calls[1]?.[0]).toMatchObject({
      id: saved.id,
      expectedVersion: 2,
      expectedContext: context,
      summary: 'Newest edit of the vehicle facts.',
    });
    await settle(QUIET_MS * 2);
    expect(writes()).toBe(3);
  });

  it('rerender cleanup never writes; a clean acknowledged unmount stays silent', async () => {
    const { hook, change } = setup();
    await settle();
    const draft = facts('Rerendered vehicle facts.');
    change({ draft });
    await settle(100);
    change({ draft: { ...draft } });
    await settle(100);
    change({ draft: { ...draft } });
    await settle(QUIET_MS - 1);
    expect(writes()).toBe(0);
    await settle(1);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(hook.result.current.hasUnsavedChanges).toBe(false);
    hook.unmount();
    await settle(QUIET_MS * 2);
    expect(writes()).toBe(1);
  });

  it.each<[string, (s: Lifecycle) => unknown]>([
    ['signed-out', s => s.change({ account: null })],
    ['unverified', s => s.change({ account: { ...account, emailVerified: false } })],
    ['invalid', s => s.type(oversized)],
    ['injury', s => s.change({ category: 'injury' })],
    ['start-another reset', s => act(() => s.hook.result.current.startAnother())],
  ])('never writes %s facts on unmount', async (_case, edit) => {
    const supported = { category: 'vehicle', counterparty: 'Insurer', resumeStep: 'details' };
    expect(schema.safeParse({ ...supported, summary: 'Supported facts.' }).success).toBe(true);
    expect(schema.safeParse({ ...supported, summary: oversized }).success).toBe(false);
    const lifecycle = setup();
    await settle();
    lifecycle.type('Supported facts.');
    await edit(lifecycle);
    lifecycle.hook.unmount();
    await settle(QUIET_MS * 2);
    expect(writes()).toBe(0);
  });

  it('never resurrects a deleted active draft', async () => {
    const { hook, type } = await acknowledged();
    type('Edited before delete.');
    await act(async () => {
      expect(await hook.result.current.remove(saved)).toBe(true);
    });
    hook.unmount();
    await settle(QUIET_MS * 2);
    expect(actions.remove).toHaveBeenCalledWith({ id: saved.id, expectedVersion: 1 });
    expect(writes()).toBe(1);
  });

  it('never writes past a prepared continuation hold', async () => {
    const { hook, type } = await acknowledged();
    await act(async () => {
      expect(await hook.result.current.prepareForContinuation()).toMatchObject({ id: saved.id });
    });
    type('Edited after the continuation was prepared.');
    hook.unmount();
    await settle(QUIET_MS * 2);
    expect(writes()).toBe(1);
  });

  it('never auto-retries an unknown create on unmount', async () => {
    actions.create.mockRejectedValueOnce(new Error('response lost'));
    const { hook, type } = setup();
    await settle();
    type('Facts whose receipt was lost.');
    await settle(QUIET_MS);
    expect(hook.result.current.state).toBe('error');
    type('Newer facts after the lost receipt.');
    hook.unmount();
    await settle(QUIET_MS * 2);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.update).not.toHaveBeenCalled();
  });

  it.each([
    ['conflict', 'conflict'],
    ['unavailable', 'error'],
  ])('never auto-retries a %s update on unmount', async (code, state) => {
    const { hook, type } = await acknowledged();
    actions.update.mockResolvedValueOnce({ ok: false, code });
    type('Rejected vehicle facts edit.');
    await settle(QUIET_MS);
    expect(hook.result.current.state).toBe(state);
    type('Newer facts after the rejection.');
    hook.unmount();
    await settle(QUIET_MS * 2);
    expect(actions.update).toHaveBeenCalledOnce();
    expect(writes()).toBe(2);
  });

  it('drops a late bootstrap list after unmount: no restore; typed facts create once', async () => {
    const sole = held<unknown>();
    actions.list.mockReturnValueOnce(sole.promise);
    const restoring = setup();
    await settle();
    restoring.hook.unmount();
    sole.resolve({ ok: true, items: [saved], nextCursor: null, expectedContext: context });
    await settle(QUIET_MS);
    expect(actions.resume).not.toHaveBeenCalled();
    const late = held<unknown>();
    actions.list.mockReturnValueOnce(late.promise);
    const typed = setup();
    await settle();
    typed.type('Facts typed before the first list returns.');
    typed.hook.unmount();
    late.resolve({ ok: true, items: [], nextCursor: null, expectedContext: context });
    await settle(QUIET_MS * 2);
    expect([writes(), actions.create.mock.calls[0]?.[0].expectedContext]).toEqual([1, context]);
  });

  it('drops a late account discovery after unmount; owned latest facts settle once', async () => {
    const { hook, type } = await acknowledged();
    const discovery = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    type('Edited while saving opens.');
    let opening!: Promise<boolean>;
    act(() => {
      opening = hook.result.current.openSave();
    });
    hook.unmount();
    discovery.resolve({ ok: true, ...account });
    await settle(QUIET_MS);
    expect(await opening).toBe(false);
    expect(actions.update).toHaveBeenCalledOnce();
    expect(writes()).toBe(2);
  });
});
