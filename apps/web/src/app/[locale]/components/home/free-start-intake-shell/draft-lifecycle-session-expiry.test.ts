import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftAccount } from './draft-lifecycle-editor';
import { shownState } from './draft-lifecycle-operations';
import { account, held, saved } from './tests/terminal-draft-fixtures';
import type { CategoryId, DraftState, StepId } from './types';

/** Suite-owned action mocks; no real session, tenant, database or outbound call is reached. */
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

type Args = {
  account?: DraftAccount | null;
  category: CategoryId | null;
  draft: DraftState;
  step: StepId;
};

const { expectedContext } = account;
const CURSOR = { id: saved.id, updatedAt: saved.updatedAt };
const SIGNED_OUT = { ok: false, code: 'authRequired' };
const facts: DraftState = {
  issueType: 'collision',
  incidentDate: '',
  counterparty: 'Insurer',
  desiredOutcome: '',
  summary: 'Bounded vehicle facts.',
};
Object.freeze(facts);
const factsCopy = { ...facts };

/** Real editor, commands, operations, reads and write queue over the suite-owned mocks only. */
function harness(initial: Partial<Args> = {}) {
  const onReset = vi.fn();
  const onResume = vi.fn();
  let args: Args = { account, category: 'vehicle', draft: facts, step: 'details', ...initial };
  const editor = new DraftEditor(
    () => ({ ...args, onReset, onResume }),
    () => undefined
  );
  const change = (next: Partial<Args>) => {
    args = { ...args, ...next };
  };
  return { editor, commands: new DraftLifecycleCommands(editor), onReset, onResume, change };
}
type Harness = ReturnType<typeof harness>;

/** One sequential `.then` hop per microtask so queue and read continuations settle. */
const drain = (): Promise<void> =>
  Array.from({ length: 25 }).reduce<Promise<void>>(
    chain => chain.then(() => undefined),
    Promise.resolve()
  );

async function establish(h: Harness): Promise<void> {
  await expect(h.commands.openSave()).resolves.toBe(true);
  await expect(h.commands.openManage()).resolves.toBe(true);
  expect(h.editor.view).toMatchObject({
    active: saved,
    items: [saved],
    nextCursor: CURSOR,
    intent: 'manage',
    verified: true,
    readAdmitted: true,
    managerBusy: false,
  });
}

function expectRevoked(h: Harness, intent: 'save' | 'manage', state = 'idle'): void {
  expect(h.editor.view).toMatchObject({
    active: null,
    items: [],
    nextCursor: null,
    intent,
    verified: false,
    readAdmitted: false,
    managerBusy: false,
    state,
  });
  expect(shownState(h.editor.view)).toBe(state);
  expect(h.editor.account?.emailVerified).toBe(false);
  expect(h.editor.admissionRevoked).toBe(true);
  expect(h.editor.getQueue()).toBeNull();
  expect(h.editor.current().draft).toBe(facts);
  expect(facts).toEqual(factsCopy);
  expect(h.onReset).not.toHaveBeenCalled();
  expect(h.onResume).not.toHaveBeenCalled();
}

describe('account draft admission after an authoritative expired session', () => {
  beforeEach(() => {
    for (const mock of Object.values(actions)) mock.mockReset();
    actions.account.mockResolvedValue({ ok: true, ...account });
    actions.list.mockResolvedValue({
      ok: true,
      items: [saved],
      nextCursor: CURSOR,
      expectedContext,
    });
    actions.create.mockResolvedValue({ ok: true, draft: saved });
    actions.update.mockResolvedValue({ ok: true, draft: { ...saved, version: 2 } });
  });

  it('revokes cached admission on live signed-out discovery and re-admits by OTP', async () => {
    const h = harness();
    await establish(h);
    actions.account.mockResolvedValueOnce(SIGNED_OUT);

    await expect(h.commands.openManage()).resolves.toBe(false);
    expectRevoked(h, 'manage');
    expect(actions.list).toHaveBeenCalledTimes(1);
    h.editor.autoSave();
    await drain();
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.update).not.toHaveBeenCalled();

    // The same cached props remain; only the fresh authoritative account re-admits the list.
    await expect(h.commands.onVerified()).resolves.toBeUndefined();
    expect(actions.list).toHaveBeenCalledTimes(2);
    expect(actions.list).toHaveBeenLastCalledWith({ cursor: null, expectedContext });
    expect(h.editor.account).toEqual(account);
    expect(h.editor.view).toMatchObject({
      active: saved,
      items: [saved],
      nextCursor: CURSOR,
      intent: 'manage',
      verified: true,
      readAdmitted: true,
      managerBusy: false,
    });
    h.editor.autoSave();
    await drain();
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.update).not.toHaveBeenCalled();
    expect(h.editor.current().draft).toBe(facts);
    expect(h.onReset).not.toHaveBeenCalled();
  });

  it('stops the owned queue so a held create acknowledgement never re-adopts', async () => {
    const h = harness();
    const create = held<unknown>();
    actions.create.mockReturnValueOnce(create.promise);
    const saving = h.commands.openSave();
    await drain();
    expect(actions.create).toHaveBeenCalledTimes(1);
    actions.account.mockResolvedValueOnce(SIGNED_OUT);

    await expect(h.commands.openManage()).resolves.toBe(false);
    // The dispatched write is not cancelled; its late receipt is simply never adopted.
    create.resolve({ ok: true, draft: saved });
    await expect(saving).resolves.toBe(false);
    await drain();
    expectRevoked(h, 'manage');
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.update).not.toHaveBeenCalled();
    expect(actions.list).not.toHaveBeenCalled();
  });

  it('hides a held older list that resolves after revocation', async () => {
    const h = harness();
    const list = held<unknown>();
    actions.list.mockReturnValueOnce(list.promise);
    const managing = h.commands.bootstrap();
    await drain();
    expect(actions.list).toHaveBeenCalledTimes(1);
    actions.account.mockResolvedValueOnce(SIGNED_OUT);

    await expect(h.commands.openSave()).resolves.toBe(false);
    list.resolve({ ok: true, items: [saved], nextCursor: CURSOR, expectedContext });
    await managing;
    await drain();
    expectRevoked(h, 'save');
    expect(actions.list).toHaveBeenCalledTimes(1);
    expect(actions.create).not.toHaveBeenCalled();
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('rejects a required OTP signed-out discovery quietly and revokes admission', async () => {
    const h = harness();
    await expect(h.commands.openSave()).resolves.toBe(true);
    expect(h.editor.view).toMatchObject({ active: saved, intent: 'save', verified: true });
    actions.account.mockResolvedValueOnce(SIGNED_OUT);

    await expect(h.commands.onVerified()).rejects.toThrow('secure_save_intent_failed');
    expectRevoked(h, 'save', 'error');
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.update).not.toHaveBeenCalled();
    expect(actions.list).not.toHaveBeenCalled();

    // Fresh same-owner OTP preserves the original acknowledged source and performs no write.
    await expect(h.commands.onVerified()).resolves.toBeUndefined();
    expect(h.editor.view).toMatchObject({ active: saved, intent: 'save', verified: true });
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('ignores a signed-out discovery superseded by a newer intent', async () => {
    const h = harness();
    const stale = held<unknown>();
    actions.account.mockReturnValueOnce(stale.promise);
    const first = h.commands.openManage();
    await expect(h.commands.openManage()).resolves.toBe(true);

    stale.resolve(SIGNED_OUT);
    await expect(first).resolves.toBe(false);
    expect(h.editor.account).toEqual(account);
    expect(h.editor.view).toMatchObject({
      items: [saved],
      intent: 'manage',
      verified: true,
      readAdmitted: true,
      managerBusy: false,
    });
  });

  it.each([
    ['actor', { ownerUserId: 'owner-b', tenantId: expectedContext.tenantId }],
    ['tenant', { ownerUserId: expectedContext.ownerUserId, tenantId: 'tenant_mk' }],
  ])('ignores a signed-out discovery after an %s switch', async (_kind, context) => {
    const h = harness();
    const stale = held<unknown>();
    actions.account.mockReturnValueOnce(stale.promise);
    const managing = h.commands.openManage();
    h.change({ account: { emailVerified: true, expectedContext: context } });
    const generation = h.editor.generation;

    stale.resolve(SIGNED_OUT);
    await expect(managing).resolves.toBe(false);
    expect(h.editor.account).toEqual(account);
    expect(h.editor.generation).toBe(generation);
    expect(h.editor.view.verified).toBe(true);
    expect(h.onReset).not.toHaveBeenCalled();
  });

  it('ignores a signed-out discovery after disposal', async () => {
    const h = harness();
    const stale = held<unknown>();
    actions.account.mockReturnValueOnce(stale.promise);
    const managing = h.commands.openManage();
    h.commands.dispose();
    const generation = h.editor.generation;

    stale.resolve(SIGNED_OUT);
    await expect(managing).resolves.toBe(false);
    expect(h.editor.account).toEqual(account);
    expect(h.editor.generation).toBe(generation);
    expect(h.onReset).not.toHaveBeenCalled();
  });

  it('keeps accepted signed-in unverified read admission', async () => {
    const unverified = { emailVerified: false, expectedContext };
    const h = harness({ account: unverified });
    actions.account.mockResolvedValue({ ok: true, ...unverified });

    await expect(h.commands.openManage()).resolves.toBe(true);
    expect(h.editor.account).toEqual(unverified);
    expect(h.editor.view).toMatchObject({
      items: [saved],
      intent: 'manage',
      verified: false,
      readAdmitted: true,
    });
    expect(actions.create).not.toHaveBeenCalled();
  });
});
