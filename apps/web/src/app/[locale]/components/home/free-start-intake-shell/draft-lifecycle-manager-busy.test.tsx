import { act, render, screen, waitFor, within } from '@testing-library/react';
import { NextIntlClientProvider } from 'next-intl';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import messages from '@/messages/en/freeStart.json';
import { AccountDraftStatus } from './account-draft-status';
import type { DraftAccount } from './draft-lifecycle-editor';
import { SavedDraftList } from './saved-draft-list';
import { parseSecureSaveCopy, type DraftState, type SavedDraft } from './types';
import { useDraftLifecycle } from './use-draft-lifecycle';

vi.unmock('next-intl');
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
const actions = vi.hoisted(() => ({
  account: vi.fn(),
  create: vi.fn(),
  list: vi.fn(),
  resume: vi.fn(),
  update: vi.fn(),
}));
vi.mock('@/actions/free-start-drafts', () => ({
  getFreeStartDraftAccount: actions.account,
  createFreeStartDraft: actions.create,
  listFreeStartDrafts: actions.list,
  resumeFreeStartDraft: actions.resume,
  updateFreeStartDraft: actions.update,
  deleteFreeStartDraft: vi.fn(),
}));
const account: DraftAccount = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
const facts: DraftState = {
  issueType: 'collision',
  incidentDate: '',
  counterparty: 'Insurer',
  desiredOutcome: '',
  summary: 'Bounded vehicle facts.',
};
const edited: DraftState = { ...facts, summary: 'Edited while the manager opens.' };
const blank: DraftState = { ...facts, issueType: '', counterparty: '', summary: '' };
const saved: SavedDraft = {
  ...facts,
  category: 'vehicle',
  resumeStep: 'details',
  id: '22222222-2222-4222-8222-222222222222',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  version: 1,
  createdAt: '2026-10-06T13:00:00.000Z',
  updatedAt: '2026-10-06T13:00:00.000Z',
};
const savedB: SavedDraft = { ...saved, id: '33333333-3333-4333-8333-333333333333' };
const copy = parseSecureSaveCopy(messages.freeStart.secureSave);
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
let lifecycle!: ReturnType<typeof useDraftLifecycle>;
const onReset = vi.fn(),
  onResume = vi.fn();
function Harness({ draft }: { draft: DraftState }) {
  lifecycle = useDraftLifecycle({
    account,
    category: 'vehicle',
    draft,
    step: 'details',
    onReset,
    onResume,
  });
  return (
    <>
      <AccountDraftStatus lifecycle={lifecycle} locale="en" />
      <SavedDraftList
        items={lifecycle.items}
        nextCursor={lifecycle.nextCursor}
        onDelete={vi.fn()}
        onLoadMore={() => void lifecycle.loadMore()}
        onResume={id => void lifecycle.resume(id)}
        state={lifecycle.state}
      />
    </>
  );
}
const ui = (draft: DraftState) => (
  <NextIntlClientProvider locale="en" messages={messages} timeZone="UTC">
    <Harness draft={draft} />
  </NextIntlClientProvider>
);
const controls = () => [
  within(screen.getByTestId('account-draft-status')).getByRole('button'),
  ...[saved, savedB].flatMap(draft => [
    screen.getByTestId(`free-start-resume-${draft.id}`),
    screen.getByTestId(`free-start-delete-${draft.id}`),
  ]),
  screen.getByRole('button', { name: copy.manage.loadMore }),
];
beforeEach(() => {
  vi.resetAllMocks();
  actions.list.mockResolvedValue({
    ok: true,
    items: [saved, savedB],
    nextCursor: { id: savedB.id, updatedAt: savedB.updatedAt },
    expectedContext: account.expectedContext,
  });
  actions.resume.mockResolvedValue({
    ok: true,
    draft: saved,
    expectedContext: account.expectedContext,
  });
  actions.account.mockResolvedValue({ ok: true, ...account });
});
describe('rendered manager busy ownership', () => {
  it('disables every manager control until the manager operation itself completes', async () => {
    const view = render(ui(blank));
    await waitFor(() => expect(lifecycle.items).toHaveLength(2));
    expect(actions.create).not.toHaveBeenCalled();
    await act(async () => {
      expect(await lifecycle.resume(saved.id)).toBe(true);
      view.rerender(ui(facts));
    });
    expect(actions.resume).toHaveBeenCalledOnce();
    expect(onResume).toHaveBeenCalledOnce();
    expect(lifecycle.hasUnsavedChanges).toBe(false);
    expect(actions.create).not.toHaveBeenCalled();
    expect(actions.update).not.toHaveBeenCalled();
    const discovery = held<unknown>(),
      update = held<unknown>();
    actions.account.mockReturnValueOnce(discovery.promise);
    actions.update.mockReturnValueOnce(update.promise);
    let managing!: Promise<boolean>;
    act(() => {
      managing = lifecycle.openManage();
    });
    expect(lifecycle.state).toBe('loading');
    for (const control of controls()) expect(control).toBeDisabled();
    view.rerender(ui(edited));
    await waitFor(() => expect(actions.update).toHaveBeenCalledOnce());
    expect(lifecycle.state).toBe('loading');
    for (const control of controls()) expect(control).toBeDisabled();
    await act(async () => {
      update.resolve({ ok: true, draft: { ...saved, ...edited, version: 2 } });
      await update.promise;
    });
    expect(lifecycle.managerBusy).toBe(true);
    expect(lifecycle.state).toBe('loading');
    for (const control of controls()) expect(control).toBeDisabled();
    await act(async () => {
      discovery.resolve({ ok: true, ...account });
      expect(await managing).toBe(true);
    });
    expect(lifecycle.state).toBe('saved');
    for (const control of controls()) expect(control).toBeEnabled();
    expect(actions.update).toHaveBeenCalledOnce();
    expect(actions.create).not.toHaveBeenCalled();
  });
});
