import { act, renderHook } from '@testing-library/react';
import { Fragment, StrictMode } from 'react';
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
const context = account.expectedContext;
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
const verified: Props = { account, category: 'vehicle', draft: blank, step: 'details' };
const writes = () => actions.create.mock.calls.length + actions.update.mock.calls.length;

/** Advances fake time and drains action/queue microtasks inside one act scope; no waitFor. */
async function settle(ms = 0): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
    for (let tick = 0; tick < 25; tick += 1) await Promise.resolve();
  });
}

/** Real hook and real queue; `strict` mounts under React StrictMode (setup→cleanup→setup). */
function setup(initial: Props = verified, strict = false) {
  const onReset = vi.fn(),
    onResume = vi.fn();
  let props = initial;
  const hook = renderHook(
    (current: Props) => useDraftLifecycle({ ...current, onReset, onResume }),
    { initialProps: props, wrapper: strict ? StrictMode : Fragment }
  );
  const change = (next: Partial<Props>) => {
    props = { ...props, ...next };
    hook.rerender(props);
  };
  const type = (summary: string) => change({ draft: facts(summary) });
  return { hook, onResume, change, type };
}

beforeEach(() => {
  vi.resetAllMocks();
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue({
    ok: true,
    items: [],
    nextCursor: null,
    expectedContext: context,
  });
  actions.create.mockResolvedValue({ ok: true, draft: saved });
  actions.update.mockImplementation(async (input: { expectedVersion: number }) => ({
    ok: true,
    draft: { ...saved, version: input.expectedVersion + 1 },
  }));
  actions.resume.mockResolvedValue({ ok: true, draft: saved, expectedContext: context });
  actions.remove.mockResolvedValue({ ok: true });
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
