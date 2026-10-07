import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftEditorArgs } from './draft-lifecycle-editor';
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
const signedOut = { ok: false, code: 'authRequired' };
const draft = {
  issueType: 'collision' as const,
  incidentDate: saved.incidentDate!,
  counterparty: 'Insurer',
  desiredOutcome: 'repair' as const,
  summary: saved.summary!,
};
const drain = () =>
  Array.from({ length: 25 }).reduce<Promise<void>>(
    chain => chain.then(() => undefined),
    Promise.resolve()
  );
function setup() {
  let args: DraftEditorArgs = {
    account,
    category: 'vehicle',
    step: 'preview',
    draft: { ...draft },
    onReset: vi.fn(),
    onResume: vi.fn(),
  };
  const editor = new DraftEditor(
    () => args,
    () => undefined
  );
  const commands = new DraftLifecycleCommands(editor);
  const change = (next: Partial<DraftEditorArgs>) => {
    args = { ...args, ...next };
  };
  const expire = async () => {
    actions.account.mockResolvedValueOnce(signedOut);
    await expect(commands.openManage()).resolves.toBe(false);
  };
  return { editor, commands, change, expire };
}

beforeEach(() => {
  for (const mock of Object.values(actions)) mock.mockReset();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.create.mockResolvedValue({ ok: true, draft: saved });
  actions.update.mockImplementation(input =>
    Promise.resolve({ ok: true, draft: { ...saved, ...input, version: input.expectedVersion + 1 } })
  );
  actions.list.mockResolvedValue({
    ok: true,
    items: [saved],
    nextCursor: null,
    expectedContext: account.expectedContext,
  });
});

describe('expired draft admission preserves original write identity', () => {
  it('keeps clean Save write-free and dirty Save on the same original CAS version', async () => {
    const h = setup();
    await h.commands.openSave();
    await h.expire();
    await h.commands.onVerified();
    expect(h.editor.view.active).toEqual(saved);
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.update).not.toHaveBeenCalled();
    h.change({ draft: { ...draft, summary: 'Later local facts.' } });
    await expect(h.commands.openSave()).resolves.toBe(true);
    expect(actions.update).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        id: saved.id,
        expectedVersion: 1,
        expectedContext: account.expectedContext,
        summary: 'Later local facts.',
      })
    );
    expect(actions.create).toHaveBeenCalledTimes(1);
  });

  it('retains local facts and reports a remote version conflict without rebasing', async () => {
    const h = setup();
    await h.commands.openSave();
    await h.expire();
    h.change({ draft: { ...draft, summary: 'Unseen remote edit must not be overwritten.' } });
    actions.update.mockResolvedValue({ ok: false, code: 'conflict' });
    await h.commands.onVerified();
    await expect(h.commands.openSave()).resolves.toBe(false);
    expect(actions.update).toHaveBeenCalledTimes(1);
    expect(actions.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: saved.id, expectedVersion: 1 })
    );
    expect(h.editor.view.state).toBe('conflict');
    expect(h.editor.current().draft.summary).toBe('Unseen remote edit must not be overwritten.');
    expect(actions.resume).not.toHaveBeenCalled();
    expect(actions.create).toHaveBeenCalledTimes(1);
  });

  it('never automatically retries an uncertain create and explicitly replays its original UUID', async () => {
    const h = setup();
    actions.create.mockResolvedValueOnce({ ok: false, code: 'unavailable' });
    await expect(h.commands.openSave()).resolves.toBe(false);
    const original = actions.create.mock.calls[0][0];
    await h.expire();
    await expect(h.commands.onVerified()).resolves.toBeUndefined(); // manager reads only
    h.editor.autoSave();
    await drain();
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(h.editor.view.state).toBe('error');
    await expect(h.commands.openSave()).resolves.toBe(true);
    expect(actions.create).toHaveBeenCalledTimes(2);
    expect(actions.create.mock.calls[1][0]).toEqual(original);
    expect(actions.update).not.toHaveBeenCalled();
  });

  it('rejects automatic save-intent replay until the person explicitly retries', async () => {
    const h = setup();
    actions.create.mockResolvedValueOnce({ ok: false, code: 'unavailable' });
    await h.commands.openSave();
    const original = actions.create.mock.calls[0][0];
    actions.account.mockResolvedValueOnce(signedOut);
    await h.commands.openSave();
    await expect(h.commands.onVerified()).rejects.toThrow('secure_save_intent_failed');
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(h.editor.view.state).toBe('error');
    await expect(h.commands.openSave()).resolves.toBe(true);
    expect(actions.create.mock.calls[1][0]).toEqual(original);
    expect(actions.create).toHaveBeenCalledTimes(2);
  });

  it('retains an acknowledged in-flight update version while expired receipts remain hidden', async () => {
    const h = setup();
    await h.commands.openSave();
    const update = held<unknown>();
    actions.update.mockReturnValueOnce(update.promise);
    h.change({ draft: { ...draft, summary: 'Acknowledged during expiry.' } });
    const saving = h.commands.openSave();
    await drain();
    await h.expire();
    update.resolve({
      ok: true,
      draft: { ...saved, version: 2, summary: 'Acknowledged during expiry.' },
    });
    await expect(saving).resolves.toBe(false);
    expect(h.editor.view).toMatchObject({ active: null, verified: false, readAdmitted: false });
    await h.commands.onVerified();
    expect(h.editor.view.active?.version).toBe(2);
    await expect(h.commands.openSave()).resolves.toBe(true);
    expect(actions.update).toHaveBeenCalledTimes(1);
    h.change({ draft: { ...draft, summary: 'Latest local facts.' } });
    await h.commands.openSave();
    expect(actions.update).toHaveBeenLastCalledWith(
      expect.objectContaining({ id: saved.id, expectedVersion: 2, summary: 'Latest local facts.' })
    );
    expect(actions.create).toHaveBeenCalledTimes(1);
  });

  it('preserves revoked queue ownership against an older held Resume retirement', async () => {
    const h = setup();
    await h.commands.openSave();
    const update = held<unknown>();
    actions.update.mockReturnValueOnce(update.promise);
    h.change({ draft: { ...draft, summary: 'Held source update.' } });
    const saving = h.commands.openSave();
    await drain();
    const resuming = h.commands.resume('another-draft');
    await drain();
    await h.expire();
    update.resolve({ ok: true, draft: { ...saved, version: 2, summary: 'Held source update.' } });
    await expect(saving).resolves.toBe(false);
    await expect(resuming).resolves.toBe(false);
    await expect(h.commands.onVerified()).resolves.toBeUndefined();
    expect(h.editor.view).toMatchObject({ verified: true, active: { id: saved.id, version: 2 } });
    await expect(h.commands.openSave()).resolves.toBe(true);
    expect(actions.update).toHaveBeenCalledTimes(1);
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.resume).not.toHaveBeenCalled();
  });

  it.each(['known', 'divergent'])(
    'admits the new %s source generation after unverified Resume',
    async mode => {
      const h = setup();
      const restored =
        mode === 'known'
          ? saved
          : { ...saved, version: 2, summary: 'Authoritatively recovered facts.' };
      if (mode === 'known') await h.commands.openSave();
      else {
        actions.create
          .mockResolvedValueOnce({ ok: false, code: 'unavailable' })
          .mockResolvedValueOnce({ ok: true, draft: restored });
        await expect(h.commands.openSave()).resolves.toBe(false);
        await expect(h.commands.openSave()).resolves.toBe(false);
      }
      await h.expire();
      actions.account.mockResolvedValue({ ok: true, ...account, emailVerified: false });
      actions.resume.mockResolvedValue({
        ok: true,
        draft: restored,
        expectedContext: account.expectedContext,
      });
      await expect(h.commands.openManage()).resolves.toBe(true);
      expect(h.editor.view).toMatchObject({ verified: false, readAdmitted: true });
      await expect(h.commands.resume(saved.id)).resolves.toBe(true);
      h.change({ draft: { ...draft, summary: restored.summary! } });
      actions.account.mockResolvedValue({ ok: true, ...account });
      await expect(h.commands.onVerified()).resolves.toBeUndefined();
      h.change({ draft: { ...draft, summary: 'Edit after fresh verification.' } });
      await expect(h.commands.openSave()).resolves.toBe(true);
      expect(actions.update).toHaveBeenCalledExactlyOnceWith(
        expect.objectContaining({ id: saved.id, expectedVersion: restored.version })
      );
      expect(actions.create).toHaveBeenCalledTimes(mode === 'known' ? 1 : 2);
    }
  );

  it('does not turn a same-owner client prop refresh into authoritative re-admission', async () => {
    const h = setup();
    await h.commands.openSave();
    await h.expire();
    h.change({ account: { ...account, emailVerified: false } });
    h.editor.syncAccount();
    h.change({ account: { ...account } });
    h.editor.syncAccount();
    h.editor.autoSave();
    await drain();
    expect(h.editor.view).toMatchObject({ verified: false, readAdmitted: false, active: null });
    expect(h.editor.getQueue()).toBeNull();
    expect(actions.create).toHaveBeenCalledTimes(1);
    await h.commands.onVerified();
    expect(h.editor.view).toMatchObject({ verified: true, active: saved });
  });

  it.each(['owner', 'tenant'])(
    'never restores retained source after a fresh %s change',
    async kind => {
      const h = setup();
      await h.commands.openSave();
      await h.expire();
      const next = {
        ...account,
        expectedContext: {
          ...account.expectedContext,
          ...(kind === 'owner' ? { ownerUserId: 'owner-b' } : { tenantId: 'tenant_mk' }),
        },
      };
      h.change({ account: next });
      h.editor.syncAccount();
      expect(h.editor.current().onReset).toHaveBeenCalledTimes(1);
      actions.account.mockResolvedValue({ ok: true, ...next });
      actions.list.mockResolvedValue({
        ok: true,
        items: [],
        nextCursor: null,
        expectedContext: next.expectedContext,
      });
      await h.commands.openManage();
      expect(h.editor.view.active).toBeNull();
      expect(actions.update).not.toHaveBeenCalled();
      expect(actions.create).toHaveBeenCalledTimes(1);
    }
  );

  it('does not admit a pending original receipt after disposal during fresh verification', async () => {
    const h = setup();
    const create = held<unknown>();
    actions.create.mockReturnValueOnce(create.promise);
    const saving = h.commands.openSave();
    await drain();
    await h.expire();
    const verifying = h.commands.onVerified();
    await drain();
    h.commands.dispose();
    create.resolve({ ok: true, draft: saved });
    await expect(saving).resolves.toBe(false);
    await expect(verifying).rejects.toThrow('secure_save_intent_failed');
    expect(h.editor.view.active).toBeNull();
    expect(actions.create).toHaveBeenCalledTimes(1);
    expect(actions.update).not.toHaveBeenCalled();
  });
});
