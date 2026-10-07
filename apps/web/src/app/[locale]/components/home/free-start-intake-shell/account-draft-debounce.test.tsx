import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { DraftAccount } from './draft-lifecycle-editor';
import { account, held, saved } from './tests/terminal-draft-fixtures';
import type { CategoryId, DraftState, SavedDraft, StepId } from './types';
import { useDraftLifecycle } from './use-draft-lifecycle';

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

type Props = Readonly<{
  account?: DraftAccount | null;
  category: CategoryId | null;
  draft: DraftState;
  step: StepId;
}>;
const QUIET_MS = 250;
const blank: DraftState = {
  issueType: '',
  incidentDate: '',
  counterparty: '',
  desiredOutcome: '',
  summary: '',
};
const facts = (summary: string): DraftState => ({
  ...blank,
  issueType: 'collision',
  counterparty: 'Insurer',
  summary,
});
const burst = (prefix: string): string[] =>
  [1, 2, 3, 4].map(length => `${prefix} vehicle facts ${'x'.repeat(length)}.`);
const verified: Props = { account, category: 'vehicle', draft: blank, step: 'details' };
const unresolved: Props = { category: 'vehicle', draft: blank, step: 'details' };
const other: DraftAccount = {
  ...account,
  expectedContext: { ...account.expectedContext, ownerUserId: 'owner-b' },
};

/** Advances fake time and drains action/queue microtasks inside one act scope; no waitFor. */
async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    for (let tick = 0; tick < 25; tick += 1) await Promise.resolve();
  });
}

function setup(initial: Props = verified) {
  const onReset = vi.fn(),
    onResume = vi.fn();
  let props = initial;
  const hook = renderHook(
    (current: Props) => useDraftLifecycle({ ...current, onReset, onResume }),
    { initialProps: props }
  );
  const change = (next: Partial<Props>) => {
    props = { ...props, ...next };
    hook.rerender(props);
  };
  const type = (summary: string) => change({ draft: facts(summary) });
  return { hook, onReset, onResume, change, type };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  localStorage.clear();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue({
    ok: true,
    items: [],
    nextCursor: null,
    expectedContext: account.expectedContext,
  });
  actions.create.mockResolvedValue({ ok: true, draft: saved });
  actions.update.mockImplementation(async (input: { expectedVersion: number }) => ({
    ok: true,
    draft: { ...saved, version: input.expectedVersion + 1 },
  }));
  actions.resume.mockResolvedValue({
    ok: true,
    draft: saved,
    expectedContext: account.expectedContext,
  });
  actions.remove.mockResolvedValue({ ok: true });
});
afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
});

describe('account draft automatic edit quiet window', () => {
  it('coalesces a fast-ACK burst into one latest create, then one same-id update', async () => {
    const { hook, type } = setup();
    await settle();
    expect(actions.list).toHaveBeenCalledOnce();
    const first = burst('First');
    for (const summary of first) {
      type(summary);
      await settle(200);
    }
    expect(actions.create).not.toHaveBeenCalled();
    await settle(QUIET_MS - 201);
    expect(actions.create).not.toHaveBeenCalled();
    await settle(1);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.create.mock.calls[0]?.[0]).toMatchObject({
      expectedContext: account.expectedContext,
      summary: first[3],
    });
    expect(hook.result.current).toMatchObject({ state: 'saved', hasUnsavedChanges: false });
    expect(hook.result.current.active?.id).toBe(saved.id);
    const second = burst('Second');
    for (const summary of second) {
      type(summary);
      expect(hook.result.current).toMatchObject({ state: 'dirty', hasUnsavedChanges: true });
      await settle(200);
    }
    expect(actions.update).not.toHaveBeenCalled();
    await settle(QUIET_MS - 201);
    expect(actions.update).not.toHaveBeenCalled();
    await settle(1);
    expect(actions.update).toHaveBeenCalledOnce();
    expect(actions.update.mock.calls[0]?.[0]).toMatchObject({
      id: saved.id,
      expectedVersion: 1,
      expectedContext: account.expectedContext,
      summary: second[3],
    });
    expect(actions.create).toHaveBeenCalledOnce();
    expect(hook.result.current.state).toBe('saved');
    expect(localStorage).toHaveLength(0);
  });

  it('flushes latest facts on a deliberate save inside the window; the old tick never writes', async () => {
    const { hook, type } = setup();
    await settle();
    type('Earlier vehicle facts.');
    await settle(100);
    type('Deliberate latest vehicle facts.');
    let stored: boolean | undefined;
    await act(async () => {
      stored = await hook.result.current.saveChanges();
    });
    expect(stored).toBe(true);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.create.mock.calls[0]?.[0]).toMatchObject({
      summary: 'Deliberate latest vehicle facts.',
    });
    await settle(QUIET_MS);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.update).not.toHaveBeenCalled();
    expect(hook.result.current.state).toBe('saved');
  });

  it('drains latest facts for continuation immediately; the old tick and release never write', async () => {
    const { hook, type } = setup();
    await settle();
    type('Continuation vehicle facts.');
    let receipt = null as SavedDraft | null;
    await act(async () => {
      receipt = await hook.result.current.prepareForContinuation();
    });
    expect(receipt).toMatchObject({ id: saved.id, version: 1 });
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.create.mock.calls[0]?.[0]).toMatchObject({
      summary: 'Continuation vehicle facts.',
    });
    await settle(QUIET_MS);
    act(() => hook.result.current.releaseContinuation(receipt));
    await settle(QUIET_MS);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.update).not.toHaveBeenCalled();
    expect(actions.remove).not.toHaveBeenCalled();
  });

  it('cancels a pending tick as a held resume starts, then adopts its row cleanly', async () => {
    const { hook, type, change, onResume } = setup();
    await settle();
    type('Unsaved facts before resume.');
    const row = held<unknown>();
    actions.resume.mockReturnValueOnce(row.promise);
    const pending = hook.result.current.resume(saved.id);
    await settle(QUIET_MS);
    const input = { id: saved.id, expectedContext: account.expectedContext };
    expect(actions.resume.mock.calls).toEqual([[input]]);
    expect(actions.create.mock.calls.length + actions.update.mock.calls.length).toBe(0);
    await act(async () => {
      row.resolve({ ok: true, draft: saved, expectedContext: account.expectedContext });
      expect(await pending).toBe(true);
    });
    expect(onResume).toHaveBeenCalledWith(saved);
    await settle(QUIET_MS);
    expect(actions.create.mock.calls.length + actions.update.mock.calls.length).toBe(0);
    const { issueType, incidentDate, counterparty, desiredOutcome, summary } = saved;
    const draft = { issueType, incidentDate, counterparty, desiredOutcome, summary };
    change({ draft, step: saved.resumeStep });
    await settle(QUIET_MS);
    expect(actions.update).not.toHaveBeenCalled();
    expect(hook.result.current.hasUnsavedChanges).toBe(false);
  });

  it('drops a pending tick after start-another reset', async () => {
    const { hook, type, onReset } = setup();
    await settle();
    type('Facts before starting another.');
    let started: boolean | undefined;
    await act(async () => {
      started = await hook.result.current.startAnother();
    });
    expect(started).toBe(true);
    expect(onReset).toHaveBeenCalledOnce();
    await settle(QUIET_MS);
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('drops a pending tick after the active draft is deleted', async () => {
    const { hook, type, onReset } = setup();
    await settle();
    type('First saved vehicle facts.');
    await settle(QUIET_MS);
    expect(actions.create).toHaveBeenCalledOnce();
    type('Edited before delete.');
    let removed: boolean | undefined;
    await act(async () => {
      removed = await hook.result.current.remove(saved);
    });
    expect(removed).toBe(true);
    expect(actions.remove).toHaveBeenCalledWith({ id: saved.id, expectedVersion: 1 });
    expect(onReset).toHaveBeenCalledOnce();
    await settle(QUIET_MS);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('cancels the owner-change tick; a later unmount never writes as either owner', async () => {
    const owner = setup();
    await settle();
    owner.type('Facts before the owner changes.');
    owner.change({ account: other });
    expect(owner.onReset).toHaveBeenCalledOnce();
    await settle(QUIET_MS);
    expect(actions.list).toHaveBeenCalledOnce();
    expect(actions.create).not.toHaveBeenCalled();
    owner.hook.unmount();
    await settle(QUIET_MS);
    expect(actions.create).not.toHaveBeenCalled();
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('cancels a pending valid write when the edit becomes unsupported', async () => {
    const { type, change } = setup();
    await settle();
    type('Valid vehicle facts.');
    await settle(100);
    change({ category: 'injury' });
    await settle(QUIET_MS);
    expect(actions.create).not.toHaveBeenCalled();
  });

  it('never retries a failed uncertain create or an unresolved account from a tick', async () => {
    actions.create.mockRejectedValueOnce(new Error('response lost'));
    const failed = setup();
    await settle();
    failed.type('Facts whose receipt was lost.');
    await settle(QUIET_MS);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(failed.hook.result.current.state).toBe('error');
    failed.type('Newer facts after the failure.');
    await settle(QUIET_MS);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(failed.hook.result.current.state).toBe('error');
    failed.hook.unmount();
    const manual = setup(unresolved);
    await settle();
    manual.type('Facts before the account resolves.');
    await settle(QUIET_MS);
    expect(actions.create).toHaveBeenCalledOnce();
    expect(actions.update).not.toHaveBeenCalled();
  });
});
