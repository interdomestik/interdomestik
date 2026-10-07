import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor } from './draft-lifecycle-editor';
import { configureDefaultActions, facts, verified } from './tests/account-draft-hook-fixtures';
import { createAuthSuite, SIGNED_OUT } from './tests/draft-lifecycle-auth-fixtures';
import { account, held, saved } from './tests/terminal-draft-fixtures';

/** Suite-owned hoisted mocks; queued writes never reach a real session, tenant or database. */
const actions = await vi.hoisted(async () => {
  const { createDraftActionMocks } = await import('./tests/draft-lifecycle-auth-fixtures');
  return createDraftActionMocks();
});
vi.mock('@/actions/free-start-drafts', async () => {
  const { draftActionModule } = await import('./tests/draft-lifecycle-auth-fixtures');
  return draftActionModule(actions);
});

const LATEST = facts('Latest supported facts after known source.');
const { expectedContext } = account;
const FACTS = facts(saved.summary);
const OWNER_B = { ...account, expectedContext: { ...expectedContext, ownerUserId: 'owner-b' } };
/** An uncertain create replay that acknowledges exactly the original request's facts and step. */
const REPLAYED = { ...saved, resumeStep: 'details' as const };
const { reset, harness, establish, expectWrites, observe } = createAuthSuite(
  actions,
  { Editor: DraftEditor, Commands: DraftLifecycleCommands, configure: configureDefaultActions },
  { ...verified, draft: FACTS }
);
type Harness = ReturnType<typeof harness>;

/** Write admission gone: verified presentation hidden, existing OTP reachable, facts kept. */
function expectWriteRevoked(h: Harness, draft = FACTS): void {
  expect(h.editor.view).toMatchObject({
    active: null,
    items: [],
    nextCursor: null,
    verified: false,
    readAdmitted: false,
    managerBusy: false,
    state: 'error',
  });
  expect(h.editor.view.intent).not.toBeNull();
  expect(h.editor.admissionRevoked).toBe(true);
  expect(h.editor.getQueue()).toBeNull();
  expect(h.editor.current().draft).toBe(draft);
  expect(h.onReset).not.toHaveBeenCalled();
}

describe('queued account draft writes after an authoritative auth refusal', () => {
  beforeEach(reset);

  it.each(['create', 'update'] as const)(
    'revokes cached write admission on a live queued %s authRequired',
    async operation => {
      const h = harness();
      if (operation === 'update') {
        await establish(h);
        h.change({ draft: LATEST });
      }
      actions[operation].mockResolvedValueOnce(SIGNED_OUT);

      await expect(h.commands.openSave()).resolves.toBe(false);
      expect(actions[operation]).toHaveBeenLastCalledWith(
        expect.objectContaining({ expectedContext })
      );
      expectWriteRevoked(h, operation === 'update' ? LATEST : FACTS);
      expect(h.editor.view.intent).toBe('save');
      h.editor.autoSave();
      expectWrites(1, operation === 'update' ? 1 : 0);
    }
  );

  it('reaches verification after an automatic create refusal without intent', async () => {
    const h = harness();
    const receipt = held<unknown>();
    const dispatched = held<undefined>();
    actions.create.mockImplementationOnce(() => {
      dispatched.resolve(undefined);
      return receipt.promise;
    });
    const bootstrap = h.commands.bootstrap();
    await dispatched.promise;
    expect(h.editor.view.intent).toBeNull();

    receipt.resolve(SIGNED_OUT);
    await bootstrap;
    await h.editor.queue?.drain();
    expectWriteRevoked(h);
    expect(h.editor.view.intent).toBe('save');
    expectWrites(1, 0);
  });

  it('rejects a required verified save on its own queued auth refusal', async () => {
    const h = harness();
    await expect(h.commands.openSave()).resolves.toBe(true);
    h.change({ draft: LATEST });
    actions.update.mockResolvedValueOnce(SIGNED_OUT);

    await expect(h.commands.onVerified()).rejects.toThrow('secure_save_intent_failed');
    expectWriteRevoked(h, LATEST);
    expectWrites(1, 1);
  });

  it('admits fresh unverified reads without writes, then recovers the original CAS', async () => {
    const h = harness();
    await establish(h);
    h.change({ draft: LATEST });
    actions.update.mockResolvedValueOnce(SIGNED_OUT);
    await expect(h.commands.openSave()).resolves.toBe(false);
    const refused = actions.update.mock.calls[0]![0];

    actions.account.mockResolvedValueOnce({ ok: true, ...account, emailVerified: false });
    await expect(h.commands.openManage()).resolves.toBe(true);
    expect(h.editor.view).toMatchObject({
      active: null,
      items: [saved],
      verified: false,
      readAdmitted: true,
    });
    h.editor.autoSave();
    expectWrites(1, 1);

    // Fresh same-owner verification restores the known source; it never writes by itself.
    await expect(h.commands.onVerified()).resolves.toBeUndefined();
    expect(h.editor.view).toMatchObject({ active: saved, verified: true, state: 'error' });
    expectWrites(1, 1);
    await expect(h.commands.openSave()).resolves.toBe(true);
    expect(refused).toMatchObject({
      id: saved.id,
      expectedVersion: saved.version,
      expectedContext,
      summary: LATEST.summary,
    });
    expect(actions.update.mock.calls[1]![0]).toEqual(refused);
    expectWrites(1, 2);
    expect(h.editor.current().draft).toBe(LATEST);
    expect(h.onReset).not.toHaveBeenCalled();
  });

  it('keeps an uncertain create UUID through auth refusal without automatic replay', async () => {
    const h = harness();
    actions.create
      .mockResolvedValueOnce({ ok: false, code: 'unavailable' })
      .mockResolvedValueOnce(SIGNED_OUT)
      .mockResolvedValueOnce({ ok: true, draft: REPLAYED });
    await expect(h.commands.openSave()).resolves.toBe(false);
    await expect(h.commands.openSave()).resolves.toBe(false);
    const original = actions.create.mock.calls[0]![0];
    expect(actions.create.mock.calls[1]![0]).toEqual(original);
    expectWriteRevoked(h);

    await expect(h.commands.onVerified()).rejects.toThrow('secure_save_intent_failed');
    h.editor.autoSave();
    await h.editor.queue?.drain();
    expect(h.editor.view).toMatchObject({ verified: true, state: 'error' });
    expectWrites(2, 0);

    await expect(h.commands.openSave()).resolves.toBe(true);
    expect(actions.create.mock.calls[2]![0]).toEqual(original);
    expect(h.editor.view).toMatchObject({ active: REPLAYED, state: 'saved' });
    expectWrites(3, 0);
  });

  it.each(['owner', 'disposal', 'revoked'] as const)(
    'keeps current authority when a held queued authRequired lands after %s',
    async kind => {
      const h = harness();
      await establish(h);
      const receipt = held<unknown>();
      const dispatched = held<undefined>();
      actions.update.mockImplementationOnce(() => {
        dispatched.resolve(undefined);
        return receipt.promise;
      });
      h.change({ draft: LATEST });
      const saving = h.commands.openSave();
      await dispatched.promise;
      if (kind === 'owner') {
        h.change({ account: OWNER_B });
        expect(h.editor.syncAccount()).toBe(true);
      } else if (kind === 'disposal') {
        h.commands.dispose();
      } else {
        actions.account.mockResolvedValueOnce(SIGNED_OUT);
        await expect(h.commands.openManage()).resolves.toBe(false);
      }
      const before = observe(h);

      receipt.resolve(SIGNED_OUT);
      await expect(saving).resolves.toBe(false);
      expect(observe(h)).toEqual(before);
      expect(h.editor.admissionRevoked).toBe(kind === 'revoked');
      expect(h.onReset).toHaveBeenCalledTimes(kind === 'owner' ? 1 : 0);
      expectWrites(1, 1);
    }
  );

  it.each([
    ['unavailable', 'error'],
    ['conflict', 'conflict'],
    ['unavailableAccountContext', 'accountContext'],
  ] as const)('keeps write admission after a queued update %s refusal', async (code, state) => {
    const h = harness();
    await establish(h);
    h.change({ draft: LATEST });
    actions.update.mockResolvedValueOnce({ ok: false, code });

    await expect(h.commands.openSave()).resolves.toBe(false);
    expect(h.editor.view).toMatchObject({
      active: saved,
      items: [saved],
      verified: true,
      readAdmitted: true,
      state,
    });
    expect(h.editor.admissionRevoked).toBe(false);
    expect(h.editor.getQueue()).toBe(h.editor.queue);
    h.editor.autoSave();
    expectWrites(1, 1);
  });
});
