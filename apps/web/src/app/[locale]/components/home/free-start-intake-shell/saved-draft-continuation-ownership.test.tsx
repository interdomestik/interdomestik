import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SavedDraftContinuation } from './saved-draft-continuation';
import { DraftEditor } from './draft-lifecycle-editor';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import type { SavedDraft } from './types';
import type { useDraftLifecycle } from './use-draft-lifecycle';
const actions = vi.hoisted(() => ({ account: vi.fn(), remove: vi.fn(), list: vi.fn() }));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  listFreeStartDrafts: actions.list,
  deleteFreeStartDraft: actions.remove,
  resumeFreeStartDraft: vi.fn(),
  createFreeStartDraft: vi.fn(),
  updateFreeStartDraft: vi.fn(),
}));
const account = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
const saved: SavedDraft = {
  category: 'vehicle',
  resumeStep: 'preview',
  issueType: 'collision',
  incidentDate: '2026-10-05',
  counterparty: 'Insurer',
  desiredOutcome: 'repair',
  summary: 'Bounded vehicle facts.',
  id: '22222222-2222-4222-8222-222222222222',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-06T13:00:00.000Z',
  updatedAt: '2026-10-06T13:00:00.000Z',
};
function held<T>() {
  let resolve!: (value: T) => void, reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function setup() {
  const editor = new DraftEditor(
    () => ({
      account,
      category: 'vehicle',
      step: 'preview',
      draft: saved,
      onReset: vi.fn(),
      onResume: vi.fn(),
    }),
    vi.fn()
  );
  editor.initialized = true;
  editor.patch({ active: saved, state: 'saved' });
  editor.savedFingerprint = editor.fingerprint();
  editor.getQueue();
  const commands = new DraftLifecycleCommands(editor);
  const lifecycle: ReturnType<typeof useDraftLifecycle> = {
    ...editor.view,
    hasUnsavedChanges: false,
    loadMore: vi.fn(),
    onVerified: vi.fn(),
    openManage: commands.openManage.bind(commands),
    openSave: vi.fn(),
    remove: commands.remove.bind(commands),
    resume: commands.resume.bind(commands),
    saveChanges: vi.fn(),
    startAnother: vi.fn(),
    prepareForContinuation: commands.prepareForContinuation.bind(commands),
    releaseContinuation: commands.releaseContinuation.bind(commands),
  };
  const view = () =>
    render(
      <SavedDraftContinuation
        enabled
        lifecycle={lifecycle}
        locale="en"
        copy={{
          body: 'Continue with your saved facts.',
          label: 'Continue saved draft',
          loading: 'Loading',
          failed: 'Failed',
          retry: 'Retry',
          back: 'Back',
        }}
      />
    );
  return { editor, commands, lifecycle, view };
}
let assign: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.resetAllMocks();
  assign = vi.fn();
  vi.stubGlobal('location', { assign });
  actions.list.mockResolvedValue({
    ok: true,
    items: [saved],
    nextCursor: null,
    expectedContext: account.expectedContext,
  });
});
afterEach(() => vi.unstubAllGlobals());
describe('public continuation attempt ownership', () => {
  it('uses the current leased source for one canonical navigation without leaking lease metadata', async () => {
    const { editor, commands, view } = setup();
    view();
    fireEvent.click(screen.getByTestId('saved-draft-continue'));
    await waitFor(() =>
      expect(assign).toHaveBeenCalledExactlyOnceWith(
        `/en/member/claims/new?mode=drafts#draft=${saved.id}`
      )
    );
    expect(editor.terminal).toBe(true);
    expect(editor.current().draft).toEqual(saved);
    commands.dispose();
  });
  it('does not navigate with a receipt superseded by a newer held manager', async () => {
    const { editor, commands, lifecycle, view } = setup();
    const receipt = await commands.prepareForContinuation();
    const delivery = held<SavedDraft | null>(),
      discovery = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    lifecycle.prepareForContinuation = () => delivery.promise;
    view();
    fireEvent.click(screen.getByTestId('saved-draft-continue'));
    const managing = commands.openManage();
    await act(async () => {
      delivery.resolve(receipt);
      await delivery.promise;
    });
    await waitFor(() =>
      expect(screen.getByTestId('saved-draft-continue')).toHaveAttribute('aria-busy', 'false')
    );
    expect(assign).not.toHaveBeenCalled();
    expect(editor.view.managerBusy).toBe(true);
    expect(editor.current().draft).toEqual(saved);
    discovery.resolve({ ok: true, ...account });
    expect(await managing).toBe(true);
    commands.dispose();
  });
  it.each(['null', 'exception'])(
    'does not release a newer deletion after an old public preparation %s',
    async kind => {
      const { editor, commands, lifecycle, view } = setup();
      const delivery = held<SavedDraft | null>(),
        deletion = held<unknown>();
      actions.remove.mockReturnValueOnce(deletion.promise);
      lifecycle.prepareForContinuation = () => delivery.promise;
      view();
      fireEvent.click(screen.getByTestId('saved-draft-continue'));
      const removing = commands.remove(saved);
      await waitFor(() => expect(actions.remove).toHaveBeenCalledOnce());
      expect(editor.terminal).toBe(true);
      await act(async () => {
        if (kind === 'null') delivery.resolve(null);
        else delivery.reject(new Error('network'));
      });
      await waitFor(() =>
        expect(screen.getByTestId('saved-draft-continue')).toHaveAttribute('aria-busy', 'false')
      );
      expect(editor.terminal).toBe(true);
      expect(assign).not.toHaveBeenCalled();
      expect(editor.view.active).toEqual(saved);
      deletion.resolve({ ok: false, code: 'error' });
      expect(await removing).toBe(false);
      expect(editor.terminal).toBe(false);
      commands.dispose();
    }
  );
  it('releases its own current preparation when native navigation fails', async () => {
    assign.mockImplementation(() => {
      throw new Error('navigation unavailable');
    });
    const { editor, commands, view } = setup();
    view();
    fireEvent.click(screen.getByTestId('saved-draft-continue'));
    await waitFor(() => expect(assign).toHaveBeenCalledOnce());
    await waitFor(() =>
      expect(screen.getByTestId('saved-draft-continue')).toHaveAttribute('aria-busy', 'false')
    );
    expect(editor.terminal).toBe(false);
    expect(editor.view.active).toEqual(saved);
    commands.dispose();
  });
});
