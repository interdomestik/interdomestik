import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor } from './draft-lifecycle-editor';
import {
  configureDefaultActions,
  facts,
  verified,
  type Props,
} from './tests/account-draft-hook-fixtures';
import { account, held, saved } from './tests/terminal-draft-fixtures';

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

const { expectedContext } = account;
const CURSOR = { id: saved.id, updatedAt: saved.updatedAt };
const SIGNED_OUT = { ok: false, code: 'authRequired' };
const FACTS = facts(saved.summary);
const OWNER_B = { ...account, expectedContext: { ...expectedContext, ownerUserId: 'owner-b' } };
const LIVE = ['load', 'manage', 'resume', 'remove'] as const;
const SUPERSESSIONS = ['newer', 'owner', 'disposal'] as const;
type Operation = (typeof LIVE)[number];
type Supersession = (typeof SUPERSESSIONS)[number];
const STALE = (['load', 'resume', 'remove'] as const).flatMap(operation =>
  SUPERSESSIONS.map((kind): [Operation, Supersession] => [operation, kind])
);
/** Load more, the opened manager list, Resume and Delete: each server action and exact request. */
const ACTION: Record<Operation, Mock> = {
  load: actions.list,
  manage: actions.list,
  resume: actions.resume,
  remove: actions.remove,
};
const REQUEST: Record<Operation, object> = {
  load: { cursor: CURSOR, expectedContext },
  manage: { cursor: null, expectedContext },
  resume: { id: saved.id, expectedContext },
  remove: { id: saved.id, expectedVersion: saved.version },
};

/** Real editor, commands, operations, reads and write queue over the suite-owned mocks only. */
function harness() {
  const onReset = vi.fn();
  const onResume = vi.fn();
  let props: Props = { ...verified, draft: FACTS };
  const editor = new DraftEditor(
    () => ({ ...props, onReset, onResume }),
    () => undefined
  );
  const change = (next: Partial<Props>) => {
    props = { ...props, ...next };
  };
  return { editor, commands: new DraftLifecycleCommands(editor), onReset, change };
}
type Harness = ReturnType<typeof harness>;

/** An acknowledged source plus an admitted manager list that offers Load more. */
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

/** Dispatches one direct manager action whose server receipt `receipt` supplies. */
function direct(
  h: Harness,
  operation: Operation,
  receipt: () => Promise<unknown>
): Promise<boolean> {
  ACTION[operation].mockImplementationOnce(receipt);
  if (operation === 'resume') return h.commands.resume(saved.id);
  if (operation === 'remove') return h.commands.remove(saved);
  return operation === 'load' ? h.commands.load(CURSOR) : h.commands.openManage();
}

/** Supersedes a pending direct action by a newer manager list, owner change or disposal. */
async function supersede(h: Harness, kind: Supersession): Promise<void> {
  if (kind === 'newer') {
    await expect(h.commands.openManage()).resolves.toBe(true);
  } else if (kind === 'owner') {
    h.change({ account: OWNER_B });
    expect(h.editor.syncAccount()).toBe(true);
  } else {
    h.commands.dispose();
  }
}

/** Everything a stale receipt could disturb: presentation, owner, generation and source. */
const observe = (h: Harness) => ({
  view: h.editor.view,
  account: h.editor.account,
  generation: h.editor.generation,
  queue: h.editor.queue,
  fingerprint: h.editor.savedFingerprint,
  retired: h.editor.retiredDraft,
});

function expectWrites(creates: number, updates: number): void {
  expect(actions.create).toHaveBeenCalledTimes(creates);
  expect(actions.update).toHaveBeenCalledTimes(updates);
}

/** Revoked manage presentation (the band shows its existing OTP) with facts left in place. */
function expectRevoked(h: Harness): void {
  expect(h.editor.view).toMatchObject({
    active: null,
    items: [],
    nextCursor: null,
    intent: 'manage',
    verified: false,
    readAdmitted: false,
    managerBusy: false,
    state: 'error',
  });
  expect(h.editor.admissionRevoked).toBe(true);
  expect(h.editor.account).toEqual({ ...account, emailVerified: false });
  expect(h.editor.getQueue()).toBeNull();
  expect(h.editor.current().draft).toBe(FACTS);
  expect(h.onReset).not.toHaveBeenCalled();
}

describe('direct account draft actions after an authoritative expired session', () => {
  beforeEach(() => {
    for (const mock of Object.values(actions)) mock.mockReset();
    configureDefaultActions(actions);
    actions.list.mockResolvedValue({
      ok: true,
      items: [saved],
      nextCursor: CURSOR,
      expectedContext,
    });
  });

  it.each(LIVE)(
    'revokes admitted source on a live direct %s authRequired until fresh verification',
    async operation => {
      const h = harness();
      await establish(h);
      const generation = h.editor.generation;

      await expect(direct(h, operation, () => Promise.resolve(SIGNED_OUT))).resolves.toBe(false);
      expect(ACTION[operation]).toHaveBeenLastCalledWith(REQUEST[operation]);
      expect(actions.account).toHaveBeenCalledTimes(operation === 'manage' ? 3 : 2);
      expectRevoked(h);
      expect(h.editor.generation).toBeGreaterThan(generation);
      h.editor.autoSave();
      expectWrites(1, 0);

      // Only fresh same-owner server admission restores the original acknowledged source.
      await expect(h.commands.onVerified()).resolves.toBeUndefined();
      expect(h.editor.view).toMatchObject({
        active: saved,
        items: [saved],
        intent: 'manage',
        verified: true,
        readAdmitted: true,
        state: 'saved',
      });
      await expect(h.commands.openSave()).resolves.toBe(true);
      expectWrites(1, 0);
      h.change({ draft: facts('Changed after fresh verification.') });
      await expect(h.commands.openSave()).resolves.toBe(true);
      expect(actions.update).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({
          id: saved.id,
          expectedVersion: saved.version,
          expectedContext,
          summary: 'Changed after fresh verification.',
        })
      );
      expectWrites(1, 1);
    }
  );

  it('rejects required manage verification after its own list revokes admission', async () => {
    const h = harness();
    await establish(h);
    actions.list.mockResolvedValueOnce(SIGNED_OUT);

    await expect(h.commands.onVerified()).rejects.toThrow('secure_save_intent_failed');
    expectRevoked(h);
    expectWrites(1, 0);
    await expect(h.commands.onVerified()).resolves.toBeUndefined();
    expect(actions.list).toHaveBeenCalledTimes(3);
    expect(h.editor.view).toMatchObject({ active: saved, verified: true, readAdmitted: true });
    expectWrites(1, 0);
  });

  it.each([
    ['owner', { ownerUserId: 'owner-b', tenantId: expectedContext.tenantId }],
    ['tenant', { ownerUserId: expectedContext.ownerUserId, tenantId: 'tenant_mk' }],
  ])('never recovers a directly revoked source for a fresh %s', async (_kind, context) => {
    const h = harness();
    await establish(h);
    await expect(direct(h, 'resume', () => Promise.resolve(SIGNED_OUT))).resolves.toBe(false);
    const next = { emailVerified: true, expectedContext: context };
    h.change({ account: next });
    expect(h.editor.syncAccount()).toBe(true);
    expect(h.onReset).toHaveBeenCalledTimes(1);
    actions.account.mockResolvedValue({ ok: true, ...next });
    actions.list.mockResolvedValue({
      ok: true,
      items: [],
      nextCursor: null,
      expectedContext: context,
    });

    await expect(h.commands.openManage()).resolves.toBe(true);
    expect(h.editor.view).toMatchObject({ active: null, items: [], verified: true });
    expect(h.editor.admissionRevoked).toBe(false);
    h.editor.autoSave();
    expectWrites(1, 0);
  });

  it.each(STALE)(
    'keeps newer authority when a stale direct %s authRequired lands after %s',
    async (operation, kind) => {
      const h = harness();
      await establish(h);
      const receipt = held<unknown>();
      const dispatched = held<undefined>();
      const pending = direct(h, operation, () => {
        dispatched.resolve(undefined);
        return receipt.promise;
      });
      await dispatched.promise;
      await supersede(h, kind);
      const before = observe(h);

      receipt.resolve(SIGNED_OUT);
      await expect(pending).resolves.toBe(false);
      expect(observe(h)).toEqual(before);
      expect(h.editor.admissionRevoked).toBe(false);
      expect(h.editor.account?.emailVerified).toBe(true);
      expect(h.onReset).toHaveBeenCalledTimes(kind === 'owner' ? 1 : 0);
      expectWrites(1, 0);
    }
  );
});
