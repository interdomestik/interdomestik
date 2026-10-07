import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftAccount, type DraftEditorArgs } from './draft-lifecycle-editor';
import type { CategoryId, DraftState, SavedDraft } from './types';

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
const account: DraftAccount = {
  emailVerified: true,
  expectedContext: { ownerUserId: 'owner-a', tenantId: 'tenant_ks' },
};
const blank: DraftState = {
  issueType: '',
  incidentDate: '',
  counterparty: '',
  desiredOutcome: '',
  summary: '',
};
const vehicleRow: SavedDraft = {
  category: 'vehicle',
  resumeStep: 'preview',
  issueType: 'collision',
  incidentDate: '2026-10-05',
  counterparty: 'Insurer',
  desiredOutcome: 'repair',
  summary: 'Older saved vehicle facts.',
  id: '22222222-2222-4222-8222-222222222222',
  clientRequestId: '11111111-1111-4111-8111-111111111111',
  version: 3,
  createdAt: '2026-10-06T13:00:00.000Z',
  updatedAt: '2026-10-06T13:00:00.000Z',
};
const propertyRow: SavedDraft = {
  ...blank,
  category: 'property',
  resumeStep: 'details',
  summary: 'Supported property facts.',
  id: '33333333-3333-4333-8333-333333333333',
  clientRequestId: '44444444-4444-4444-8444-444444444444',
  version: 1,
  createdAt: '2026-10-07T09:00:00.000Z',
  updatedAt: '2026-10-07T09:00:00.000Z',
};
const listed = (items: SavedDraft[]) => ({
  ok: true,
  items,
  nextCursor: null,
  expectedContext: account.expectedContext,
});
const drain = () =>
  Array.from({ length: 25 }).reduce<Promise<void>>(
    chain => chain.then(() => undefined),
    Promise.resolve()
  );
function held<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(done => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup(category: CategoryId | null) {
  const onResume = vi.fn(),
    onReset = vi.fn();
  let args: DraftEditorArgs = {
    account,
    category,
    step: category ? 'details' : 'category',
    draft: { ...blank },
    onReset,
    onResume,
  };
  const editor = new DraftEditor(
    () => args,
    () => undefined
  );
  const commands = new DraftLifecycleCommands(editor);
  const change = (next: Partial<DraftEditorArgs>) => {
    args = { ...args, ...next };
  };
  return { editor, commands, onResume, onReset, change };
}
type Harness = ReturnType<typeof setup>;

/** Later facts become a new source; the unrelated saved row is never adopted or rewritten. */
async function expectNewPropertySource(h: Harness): Promise<void> {
  h.change({ draft: { ...blank, summary: propertyRow.summary } });
  h.editor.autoSave();
  await vi.waitFor(() => expect(h.editor.view.active).toEqual(propertyRow));
  expect(actions.create).toHaveBeenCalledExactlyOnceWith(
    expect.objectContaining({
      category: 'property',
      summary: propertyRow.summary,
      expectedContext: account.expectedContext,
    })
  );
  expect(actions.update).not.toHaveBeenCalled();
  expect(actions.resume).not.toHaveBeenCalled();
  expect(h.editor.view.items).toEqual([vehicleRow]);
}

beforeEach(() => {
  vi.resetAllMocks();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue(listed([vehicleRow]));
  actions.resume.mockResolvedValue({
    ok: true,
    draft: vehicleRow,
    expectedContext: account.expectedContext,
  });
  actions.create.mockResolvedValue({ ok: true, draft: propertyRow });
  actions.update.mockImplementation(input =>
    Promise.resolve({
      ok: true,
      draft: { ...propertyRow, ...input, version: input.expectedVersion + 1 },
    })
  );
});

describe('sole saved draft bootstrap respects the current explicit category', () => {
  it('keeps a different explicit initial category and saves later facts as new', async () => {
    const h = setup('property');
    try {
      await h.commands.bootstrap();
      await drain();
      expect(actions.resume).not.toHaveBeenCalled();
      expect(h.onResume).not.toHaveBeenCalled();
      expect(h.onReset).not.toHaveBeenCalled();
      expect(h.editor.view).toMatchObject({
        active: null,
        items: [vehicleRow],
        readAdmitted: true,
      });
      expect(h.editor.current()).toMatchObject({ category: 'property', step: 'details' });
      await expectNewPropertySource(h);
    } finally {
      h.commands.dispose();
    }
  });
  it('keeps a different category chosen while the bootstrap list is held', async () => {
    const list = held<unknown>();
    actions.list.mockReturnValueOnce(list.promise);
    const h = setup(null);
    try {
      const booting = h.commands.bootstrap();
      h.change({ category: 'property', step: 'details' });
      list.resolve(listed([vehicleRow]));
      await booting;
      await vi.waitFor(() => expect(h.editor.initialized).toBe(true));
      await drain();
      expect(actions.list).toHaveBeenCalledTimes(2);
      expect(actions.resume).not.toHaveBeenCalled();
      expect(h.onResume).not.toHaveBeenCalled();
      expect(h.editor.view).toMatchObject({ active: null, items: [vehicleRow] });
      expect(h.editor.current().category).toBe('property');
      await expectNewPropertySource(h);
    } finally {
      h.commands.dispose();
    }
  });
  it.each([
    { label: 'unset', category: null },
    { label: 'matching', category: 'vehicle' as const },
  ])('restores the sole saved draft when the current category is $label', async ({ category }) => {
    const h = setup(category);
    try {
      await h.commands.bootstrap();
      expect(actions.resume).toHaveBeenCalledOnce();
      expect(h.onResume).toHaveBeenCalledExactlyOnceWith(vehicleRow);
      expect(h.editor.view.active?.id).toBe(vehicleRow.id);
    } finally {
      h.commands.dispose();
    }
  });
});
