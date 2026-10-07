import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftEditorArgs } from './draft-lifecycle-editor';
import { account, held, saved } from './tests/terminal-draft-fixtures';
import type { DraftState, SavedDraft } from './types';

const actions = vi.hoisted(() => ({ create: vi.fn(), update: vi.fn(), resume: vi.fn() }));
vi.mock('@/actions/free-start-drafts', () => ({
  createFreeStartDraft: actions.create,
  updateFreeStartDraft: actions.update,
  resumeFreeStartDraft: actions.resume,
  getFreeStartDraftAccount: vi.fn(),
  listFreeStartDrafts: vi.fn(),
  deleteFreeStartDraft: vi.fn(),
}));

// A divergent replay proves the original create committed; it is never adopted automatically.
const LOSSES = ['thrown', 'unavailable'] as const;
type Loss = (typeof LOSSES)[number];
const CHANGED: SavedDraft[] = [
  { ...saved, version: 2, summary: 'Changed in another session.' },
  { ...saved, summary: 'Changed facts at the original version.' },
];
const CASES = CHANGED.flatMap(row => LOSSES.map(loss => ({ loss, version: row.version, row })));
const OTHER_OWNER = { ownerUserId: 'owner-b', tenantId: 'tenant_ks' };

const facts = (row: SavedDraft, summary = row.summary): DraftState => ({
  issueType: row.issueType,
  incidentDate: row.incidentDate,
  counterparty: row.counterparty,
  desiredOutcome: row.desiredOutcome,
  summary,
});
const receipt = (draft: SavedDraft, expectedContext = account.expectedContext) => ({
  ok: true,
  draft,
  expectedContext,
});

function loseFirstCreate(loss: Loss): void {
  if (loss === 'thrown') actions.create.mockRejectedValueOnce(new Error('lost receipt'));
  else actions.create.mockResolvedValueOnce({ ok: false, code: 'unavailable' });
}

function setup() {
  let args: DraftEditorArgs = {
    account,
    category: 'vehicle',
    draft: facts(saved),
    step: 'preview',
    onResume: vi.fn(),
    onReset: vi.fn(),
  };
  const editor = new DraftEditor(() => args, vi.fn());
  editor.initialized = true;
  const edit = (next: Partial<DraftEditorArgs>) => {
    args = { ...args, ...next };
  };
  return { editor, commands: new DraftLifecycleCommands(editor), args: () => args, edit };
}
type Harness = ReturnType<typeof setup>;

/** Lost first receipt, then the exact original replay answers with a non-matching row. */
async function diverge(row: SavedDraft, loss: Loss): Promise<Harness> {
  loseFirstCreate(loss);
  actions.create.mockResolvedValueOnce({ ok: true, draft: row });
  const h = setup();
  expect(await h.commands.saveChanges()).toBe(false);
  h.editor.queue?.retry();
  await vi.waitFor(() => expect(h.editor.view.state).toBe('conflict'));
  expect(actions.create).toHaveBeenCalledTimes(2);
  expect(actions.create.mock.calls[1]![0]).toEqual(actions.create.mock.calls[0]![0]);
  expect(actions.create.mock.calls[0]![0]).toEqual(
    expect.objectContaining({ summary: saved.summary, expectedContext: account.expectedContext })
  );
  expect(h.editor.view.active).toBeNull();
  expect(h.editor.savedFingerprint).toBeNull();
  expect(h.args().draft).toEqual(facts(saved));
  expect(actions.update).not.toHaveBeenCalled();
  return h;
}

/** Failed recovery keeps local facts and every server row untouched and never creates again. */
async function expectFrozen(h: Harness): Promise<void> {
  expect(h.editor.view.active).toBeNull();
  expect(h.editor.savedFingerprint).toBeNull();
  expect(h.args().onResume).not.toHaveBeenCalled();
  expect(h.args().onReset).not.toHaveBeenCalled();
  expect(h.args().draft).toEqual(facts(saved));
  h.editor.autoSave();
  expect(await h.commands.saveChanges()).toBe(false);
  expect(h.editor.queue?.getWriteFeedback()).toBe('conflict');
  expect(actions.create).toHaveBeenCalledTimes(2);
  expect(actions.update).not.toHaveBeenCalled();
}

beforeEach(() => vi.resetAllMocks());

describe('authoritative recovery after divergent create replay', () => {
  it.each(CASES)(
    'resumes confirmed row v$version after a $loss receipt; one later edit updates it',
    async ({ loss, row }) => {
      const h = await diverge(row, loss);
      actions.resume.mockResolvedValueOnce(receipt(row));
      expect(await h.commands.resume(row.id)).toBe(true);
      expect(actions.resume).toHaveBeenCalledOnce();
      expect(actions.resume).toHaveBeenCalledWith({
        id: row.id,
        expectedContext: account.expectedContext,
      });
      expect(h.editor.view.active).toEqual(row);
      expect(h.editor.view.state).toBe('saved');
      expect(h.editor.queue?.getDraft()).toEqual(row);
      expect(h.args().onResume).toHaveBeenCalledOnce();
      expect(h.args().onResume).toHaveBeenCalledWith(row);
      expect(h.args().onReset).not.toHaveBeenCalled();
      expect(actions.create).toHaveBeenCalledTimes(2);
      expect(actions.update).not.toHaveBeenCalled();

      const next = { ...row, summary: 'Newer deliberate edit.', version: row.version + 1 };
      actions.update.mockResolvedValueOnce({ ok: true, draft: next });
      h.edit({ draft: facts(row, next.summary) });
      expect(await h.commands.saveChanges()).toBe(true);
      expect(actions.update).toHaveBeenCalledOnce();
      expect(actions.update).toHaveBeenCalledWith(
        expect.objectContaining({
          id: row.id,
          expectedVersion: row.version,
          summary: next.summary,
          expectedContext: account.expectedContext,
        })
      );
      expect(h.editor.view.active).toEqual(next);
      expect(actions.create).toHaveBeenCalledTimes(2);
      h.commands.dispose();
    }
  );

  it.each(LOSSES)(
    'still refuses Resume and Start another while a %s create is genuinely unknown',
    async loss => {
      loseFirstCreate(loss);
      actions.create.mockResolvedValueOnce({ ok: true, draft: saved });
      const h = setup();
      expect(await h.commands.saveChanges()).toBe(false);
      expect(await h.commands.resume(saved.id)).toBe(false);
      expect(await h.commands.startAnother()).toBe(false);
      expect(actions.resume).not.toHaveBeenCalled();
      expect(actions.create).toHaveBeenCalledOnce();
      expect(actions.update).not.toHaveBeenCalled();
      expect(h.editor.view.active).toBeNull();
      expect(h.args().draft).toEqual(facts(saved));
      expect(h.args().onReset).not.toHaveBeenCalled();
      // The exact original replay remains the only identity recovery.
      h.editor.queue?.retry();
      await vi.waitFor(() => expect(h.editor.view.active).toEqual(saved));
      expect(actions.create).toHaveBeenCalledTimes(2);
      expect(actions.create.mock.calls[1]![0]).toEqual(actions.create.mock.calls[0]![0]);
      expect(actions.update).not.toHaveBeenCalled();
      h.commands.dispose();
    }
  );

  it.each(['failed', 'thrown', 'foreign'] as const)(
    'keeps the replay frozen after a %s recovery receipt and allows a deliberate retry',
    async kind => {
      const row = CHANGED[0]!;
      const h = await diverge(row, 'thrown');
      if (kind === 'failed') actions.resume.mockResolvedValueOnce({ ok: false, code: 'notFound' });
      else if (kind === 'thrown') actions.resume.mockRejectedValueOnce(new Error('offline'));
      else actions.resume.mockResolvedValueOnce(receipt(row, OTHER_OWNER));
      expect(await h.commands.resume(row.id)).toBe(false);
      expect(h.editor.view.state).toBe(kind === 'foreign' ? 'accountContext' : 'error');
      await expectFrozen(h);
      actions.resume.mockResolvedValueOnce(receipt(row));
      expect(await h.commands.resume(row.id)).toBe(true);
      expect(h.editor.view.active).toEqual(row);
      expect(h.args().onResume).toHaveBeenCalledOnce();
      expect(actions.create).toHaveBeenCalledTimes(2);
      expect(actions.update).not.toHaveBeenCalled();
      h.commands.dispose();
    }
  );

  it.each([
    { label: 'owner', expectedContext: OTHER_OWNER },
    { label: 'tenant', expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_mk' } },
  ])(
    'ignores a recovery receipt after the $label changed and writes for neither',
    async ({ expectedContext }) => {
      const h = await diverge(CHANGED[1]!, 'unavailable');
      const pending = held<unknown>();
      actions.resume.mockReturnValueOnce(pending.promise);
      const resumed = h.commands.resume(CHANGED[1]!.id);
      await vi.waitFor(() => expect(actions.resume).toHaveBeenCalledOnce());
      h.edit({ account: { emailVerified: true, expectedContext } });
      expect(h.editor.syncAccount()).toBe(true);
      pending.resolve(receipt(CHANGED[1]!));
      expect(await resumed).toBe(false);
      expect(h.editor.view.active).toBeNull();
      expect(h.args().onResume).not.toHaveBeenCalled();
      expect(h.editor.queue).toBeNull();
      h.editor.autoSave();
      expect(actions.create).toHaveBeenCalledTimes(2);
      expect(actions.update).not.toHaveBeenCalled();
      h.commands.dispose();
    }
  );

  it('keeps the replay frozen when local facts change before the recovery receipt', async () => {
    const row = CHANGED[0]!;
    const h = await diverge(row, 'thrown');
    const pending = held<unknown>();
    actions.resume.mockReturnValueOnce(pending.promise);
    const resumed = h.commands.resume(row.id);
    await vi.waitFor(() => expect(actions.resume).toHaveBeenCalledOnce());
    h.edit({ draft: facts(saved, 'Newer local edit.') });
    h.editor.autoSave();
    pending.resolve(receipt(row));
    expect(await resumed).toBe(false);
    expect(h.editor.view.active).toBeNull();
    expect(h.args().onResume).not.toHaveBeenCalled();
    expect(h.args().draft.summary).toBe('Newer local edit.');
    expect(await h.commands.saveChanges()).toBe(false);
    expect(h.editor.queue?.getWriteFeedback()).toBe('conflict');
    expect(actions.create).toHaveBeenCalledTimes(2);
    expect(actions.update).not.toHaveBeenCalled();
    h.commands.dispose();
  });
});
