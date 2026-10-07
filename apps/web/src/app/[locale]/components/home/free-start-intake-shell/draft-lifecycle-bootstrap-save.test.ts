import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftAccount, type DraftEditorArgs } from './draft-lifecycle-editor';
import type { SavedDraft } from './types';

const actions = vi.hoisted(() => ({ account: vi.fn(), create: vi.fn(), list: vi.fn() }));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  createFreeStartDraft: actions.create,
  listFreeStartDrafts: actions.list,
  deleteFreeStartDraft: vi.fn(),
  resumeFreeStartDraft: vi.fn(),
  updateFreeStartDraft: vi.fn(),
}));
const account: DraftAccount = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
const saved: SavedDraft = {
  category: 'vehicle',
  resumeStep: 'details',
  issueType: 'collision',
  incidentDate: '',
  counterparty: 'Insurer',
  desiredOutcome: '',
  summary: 'Bounded vehicle facts.',
  id: '22222222-2222-4222-8222-222222222222',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-06T13:00:00.000Z',
  updatedAt: '2026-10-06T13:00:00.000Z',
};
function held<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: Error) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function setup() {
  const args: DraftEditorArgs = {
    account,
    category: 'vehicle',
    step: 'details',
    draft: {
      issueType: saved.issueType!,
      incidentDate: '',
      counterparty: saved.counterparty!,
      desiredOutcome: '',
      summary: saved.summary!,
    },
    onReset: vi.fn(),
    onResume: vi.fn(),
  };
  const editor = new DraftEditor(() => args, vi.fn());
  return { editor, commands: new DraftLifecycleCommands(editor) };
}
beforeEach(() => {
  vi.resetAllMocks();
  actions.account.mockResolvedValue({ ok: true, ...account });
});
describe('background bootstrap cannot settle a later deliberate save', () => {
  it.each([
    { late: 'success', state: 'saving', entry: 'openSave' },
    { late: 'success', state: 'error', entry: 'openSave' },
    { late: 'success', state: 'saved', entry: 'saveChanges' },
    { late: 'failure', state: 'saving', entry: 'saveChanges' },
    { late: 'failure', state: 'saved', entry: 'openSave' },
    { late: 'throw', state: 'saved', entry: 'saveChanges' },
  ] as const)(
    'ignores late $late during $entry $state, preserving an explicit retry',
    async ({ late, state, entry }) => {
      const list = held<unknown>(),
        write = held<unknown>();
      actions.list.mockReturnValueOnce(list.promise);
      actions.create.mockReturnValueOnce(write.promise);
      const { editor, commands } = setup();
      const booting = commands.bootstrap();
      expect(actions.list).toHaveBeenCalledOnce();
      const storing = commands[entry]();
      try {
        await vi.waitFor(() => expect(actions.create).toHaveBeenCalledOnce());
        if (state !== 'saving') {
          write.resolve(
            state === 'saved' ? { ok: true, draft: saved } : { ok: false, code: 'error' }
          );
          expect(await storing).toBe(state === 'saved');
        }
        expect(editor.view.state).toBe(state);
        if (late === 'throw') list.reject(new Error('Synthetic list transport failure'));
        else
          list.resolve(
            late === 'failure'
              ? { ok: false, code: 'invalid' }
              : {
                  ok: true,
                  items: [{ ...saved, id: '33333333-3333-4333-8333-333333333333' }],
                  nextCursor: null,
                  expectedContext: account.expectedContext,
                }
          );
        await booting;
        expect(editor.view.state).toBe(state);
        expect(editor.view.items).toEqual([]);
        expect(actions.create).toHaveBeenCalledOnce();
        if (state === 'saving') {
          write.resolve({ ok: false, code: 'error' });
          expect(await storing).toBe(false);
        }
        if (state !== 'saved') {
          expect(editor.view.state).toBe('error');
          actions.create.mockResolvedValueOnce({ ok: true, draft: saved });
          expect(await commands.saveChanges()).toBe(true);
          expect(actions.create).toHaveBeenCalledTimes(2);
          expect(actions.create.mock.calls[1]![0]).toEqual(actions.create.mock.calls[0]![0]);
          expect(editor.view.state).toBe('saved');
        }
        expect(editor.view.active?.id).toBe(saved.id);
      } finally {
        list.resolve({
          ok: true,
          items: [],
          nextCursor: null,
          expectedContext: account.expectedContext,
        });
        write.resolve({ ok: false, code: 'error' });
        await Promise.all([booting, storing]);
        commands.dispose();
      }
    }
  );
});
