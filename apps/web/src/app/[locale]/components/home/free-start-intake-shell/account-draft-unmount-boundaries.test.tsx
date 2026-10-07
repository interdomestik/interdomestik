import { act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  configureDefaultActions,
  facts,
  QUIET_MS,
  settle,
  setup,
  verified,
} from './tests/account-draft-hook-fixtures';
import { account, held, saved } from './tests/terminal-draft-fixtures';
import type { SavedDraft } from './types';

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

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  configureDefaultActions(actions);
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('account draft exit boundaries', () => {
  it('resume cancels pending edits; exit before its held row never writes them', async () => {
    const { hook, type, onResume, change } = setup();
    await settle();
    type('Acknowledged vehicle facts.');
    await settle(QUIET_MS);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(hook.result.current.hasUnsavedChanges).toBe(false);
    type('Edited before choosing resume.');
    await settle(100);
    const row = held<unknown>();
    actions.resume.mockReturnValueOnce(row.promise);
    let resuming!: Promise<boolean>;
    act(() => {
      resuming = hook.result.current.resume(saved.id);
    });
    await settle();
    expect(actions.resume.mock.calls).toEqual([[{ id: saved.id, expectedContext: context }]]);
    expect(writes()).toBe(1);
    change({ draft: facts('Edited before choosing resume.') });
    await settle(QUIET_MS);
    expect(writes()).toBe(1);
    hook.unmount();
    await settle(QUIET_MS * 2);
    expect(writes()).toBe(1);
    row.resolve({ ok: true, draft: { ...saved, version: 2 }, expectedContext: context });
    await settle(QUIET_MS);
    expect(await resuming).toBe(false);
    expect(onResume).not.toHaveBeenCalled();
    expect(hook.result.current.active?.version).toBe(1);
    expect(writes()).toBe(1);
  });

  it('changed facts after resume cancellation re-admit the latest once', async () => {
    const { hook, type } = setup();
    await settle();
    type('Acknowledged vehicle facts.');
    await settle(QUIET_MS);
    expect(actions.create).toHaveBeenCalledOnce();
    type('Edited before choosing resume.');
    await settle(100);
    actions.resume.mockReturnValueOnce(held<unknown>().promise);
    act(() => {
      void hook.result.current.resume(saved.id);
    });
    await settle();
    expect(writes()).toBe(1);
    type('Changed after choosing resume.');
    await settle(QUIET_MS - 1);
    expect(writes()).toBe(1);
    await settle(1);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.update).toHaveBeenCalledOnce();
    expect(actions.update.mock.calls[0]?.[0]).toMatchObject({
      id: saved.id,
      expectedVersion: 1,
      expectedContext: context,
      summary: 'Changed after choosing resume.',
    });
  });

  it.each<[string, SavedDraft[]]>([
    ['empty', []],
    ['sole', [saved]],
  ])('pre-list typed facts create once on exit; late %s list is inert', async (_c, items) => {
    const first = held<unknown>();
    actions.list.mockReturnValueOnce(first.promise);
    const { hook, type } = setup();
    await settle();
    type('Typed vehicle facts x.');
    await settle(100);
    type('Latest typed vehicle facts.');
    await settle(100);
    expect(writes()).toBe(0);
    hook.unmount();
    await settle();
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.create.mock.calls[0]?.[0]).toMatchObject({
      category: 'vehicle',
      resumeStep: 'details',
      summary: 'Latest typed vehicle facts.',
    });
    expect(actions.create.mock.calls[0]?.[0].expectedContext).toEqual(context);
    first.resolve({ ok: true, items, nextCursor: null, expectedContext: context });
    await settle(QUIET_MS * 2);
    expect(actions.list).toHaveBeenCalledOnce();
    expect(actions.resume).not.toHaveBeenCalled();
    expect(writes()).toBe(1);
    expect(hook.result.current).toMatchObject({ items: [], active: null });
  });

  it('StrictMode rehearsal stays usable; quiet and exit each save latest once', async () => {
    const { hook, type } = setup(verified, true);
    await settle(QUIET_MS);
    expect(actions.list).toHaveBeenCalledOnce();
    expect(writes()).toBe(0);
    for (const summary of ['Strict vehicle facts x.', 'Strict vehicle facts xx.']) {
      type(summary);
      await settle(100);
    }
    type('Strict latest vehicle facts.');
    await settle(QUIET_MS - 1);
    expect(writes()).toBe(0);
    await settle(1);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.create.mock.calls[0]?.[0]).toMatchObject({
      expectedContext: context,
      summary: 'Strict latest vehicle facts.',
    });
    expect(hook.result.current).toMatchObject({ state: 'saved', hasUnsavedChanges: false });
    expect(hook.result.current.active?.id).toBe(saved.id);
    type('Strict edit before leaving.');
    await settle(100);
    hook.unmount();
    await settle(QUIET_MS * 2);
    expect(actions.update).toHaveBeenCalledOnce();
    expect(actions.update.mock.calls[0]?.[0]).toMatchObject({
      id: saved.id,
      expectedVersion: 1,
      expectedContext: context,
      summary: 'Strict edit before leaving.',
    });
    expect(writes()).toBe(2);
  });

  it('StrictMode probe never saves initial facts; only the actual exit does, once', async () => {
    const first = held<unknown>();
    actions.list.mockReturnValueOnce(first.promise);
    const draft = facts('Initial supported vehicle facts.');
    const { hook, change } = setup({ ...verified, draft }, true);
    await settle();
    expect(writes()).toBe(0);
    change({ draft: { ...draft } });
    await settle(QUIET_MS * 2);
    expect(writes()).toBe(0);
    hook.unmount();
    await settle();
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.create.mock.calls[0]?.[0]).toMatchObject({
      expectedContext: context,
      summary: 'Initial supported vehicle facts.',
    });
    first.resolve({ ok: true, items: [saved], nextCursor: null, expectedContext: context });
    await settle(QUIET_MS * 2);
    expect(actions.list).toHaveBeenCalledOnce();
    expect(actions.resume).not.toHaveBeenCalled();
    expect(writes()).toBe(1);
  });
});
