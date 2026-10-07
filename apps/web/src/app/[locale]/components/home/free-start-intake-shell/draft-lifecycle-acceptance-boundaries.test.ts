import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createAnonymousDraftSnapshot } from './anonymous-draft-recovery';
import { DraftLifecycleCommands } from './draft-lifecycle-commands';
import { DraftEditor, type DraftAccount, type DraftEditorArgs } from './draft-lifecycle-editor';
import { completeBrowserRestoration } from './draft-lifecycle-restoration';
import { draftFailureState, type DraftState, type SavedDraft } from './types';

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
const ownerB: DraftAccount = {
  ...account,
  expectedContext: { ...account.expectedContext, ownerUserId: 'owner-b' },
};
const tenantB: DraftAccount = {
  ...account,
  expectedContext: { ...account.expectedContext, tenantId: 'tenant_mk' },
};
const blank: DraftState = {
  counterparty: '',
  desiredOutcome: '',
  incidentDate: '',
  issueType: '',
  summary: '',
};
const facts: DraftState = { ...blank, issueType: 'collision', summary: 'Supported vehicle facts.' };
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
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((done, fail) => {
    resolve = done;
    reject = fail;
  });
  return { promise, resolve, reject };
}
function expectNoWrites(): void {
  for (const write of [actions.create, actions.update, actions.resume, actions.remove])
    expect(write).not.toHaveBeenCalled();
}
type Harness = Readonly<{
  editor: DraftEditor;
  commands: DraftLifecycleCommands;
  onReset: () => void;
  change: (next: Partial<DraftEditorArgs>) => void;
}>;
/** Actual editor and commands; `effect` runs inside the real reset's onReset callback. */
function setup(effect?: (h: Harness) => void): Harness {
  let harness: Harness | null = null;
  const onReset = vi.fn(() => {
    if (harness) effect?.(harness);
  });
  let args: DraftEditorArgs = {
    account,
    category: 'vehicle',
    step: 'details',
    draft: { ...blank },
    onReset,
    onResume: vi.fn(),
  };
  const editor = new DraftEditor(
    () => args,
    () => undefined
  );
  harness = {
    editor,
    commands: new DraftLifecycleCommands(editor),
    onReset,
    change: next => {
      args = { ...args, ...next };
    },
  };
  return harness;
}
function snapshot() {
  const value = createAnonymousDraftSnapshot('vehicle', facts, 'details');
  if (!value) throw new Error('fixture snapshot rejected');
  return value;
}

beforeEach(() => {
  vi.resetAllMocks();
  actions.account.mockResolvedValue({ ok: true, ...account });
  actions.list.mockResolvedValue(listed([saved]));
  actions.create.mockResolvedValue({ ok: true, draft: saved });
});

describe('restoration lease names the exact accepted reset barrier', () => {
  it('leases the barrier an actual empty render released before the continuation', async () => {
    const h = setup(x => {
      x.change({ category: 'vehicle', step: 'details', draft: { ...blank } });
      x.editor.syncAccount();
    });
    try {
      const lease = await h.commands.startRestoration();
      expect(h.onReset).toHaveBeenCalledOnce();
      expect(h.editor.awaitingReset).toBe(false);
      expect(lease).not.toBeNull();
      if (!lease) return;
      const copy = snapshot();
      expect(completeBrowserRestoration(h.editor, lease, copy)).toBe(true);
      expect(completeBrowserRestoration(h.editor, lease, copy)).toBe(false);
      expect(h.editor.awaitingReset).toBe(true);
      h.change({ category: copy.category, draft: copy.draft, step: copy.resumeStep });
      h.editor.syncAccount();
      expect(h.editor.awaitingReset).toBe(false);
      expectNoWrites();
    } finally {
      h.commands.dispose();
    }
  });
  it.each(['newer reset', 'owner change', 'tenant change', 'disposal', 'admitted facts'] as const)(
    'never leases the old barrier after a %s inside its own reset',
    async kind => {
      let nested = false;
      const h = setup(x => {
        if (nested) return;
        nested = true;
        if (kind === 'newer reset') x.editor.reset();
        else if (kind === 'owner change' || kind === 'tenant change') {
          x.change({ account: kind === 'owner change' ? ownerB : tenantB });
          x.editor.syncAccount();
        } else if (kind === 'disposal') x.commands.dispose();
        else {
          x.change({ draft: facts });
          void x.commands.saveChanges();
        }
      });
      try {
        const generation = h.editor.generation;
        expect(await h.commands.startRestoration()).toBeNull();
        expect(h.editor.generation).toBeGreaterThan(generation);
        await drain();
      } finally {
        h.commands.dispose();
      }
    }
  );
});

describe('fresh same-owner list receipt before the presentation sync', () => {
  async function manageAfterStartAnother() {
    const h = setup(x => x.change({ category: null, step: 'category', draft: { ...blank } }));
    expect(await h.commands.startAnother()).toBe(true);
    h.editor.syncAccount();
    actions.account.mockResolvedValueOnce({ ok: false, code: 'authRequired' });
    expect(await h.commands.openManage()).toBe(false);
    const list = deferred<unknown>();
    actions.list.mockReturnValueOnce(list.promise);
    const verifying = h.commands.onVerified();
    await vi.waitFor(() => expect(actions.list).toHaveBeenCalledOnce());
    return { h, list, verifying };
  }
  it('admits the listed row, keeps manage intent and survives the verified refresh', async () => {
    const { h, list, verifying } = await manageAfterStartAnother();
    try {
      h.change({ account: { ...account, emailVerified: false } });
      list.resolve(listed([saved]));
      await expect(verifying).resolves.toBeUndefined();
      expect(h.editor.view).toMatchObject({
        items: [saved],
        intent: 'manage',
        readAdmitted: true,
        active: null,
      });
      h.change({ account });
      h.editor.syncAccount();
      await h.commands.bootstrap();
      await drain();
      expect(h.editor.view).toMatchObject({
        items: [saved],
        intent: 'manage',
        readAdmitted: true,
        active: null,
      });
      expectNoWrites();
    } finally {
      h.commands.dispose();
    }
  });
  it.each(['failure', 'throw'] as const)(
    'surfaces a same-owner list %s instead of hiding it',
    async kind => {
      const { h, list, verifying } = await manageAfterStartAnother();
      try {
        h.change({ account: { ...account, emailVerified: false } });
        if (kind === 'throw') list.reject(new Error('network'));
        else list.resolve({ ok: false, code: 'error' });
        await expect(verifying).rejects.toThrow('secure_save_intent_failed');
        expect(h.editor.view.state).toBe(draftFailureState('error'));
        expect(h.editor.view).toMatchObject({ items: [], intent: 'manage', readAdmitted: false });
        expectNoWrites();
      } finally {
        h.commands.dispose();
      }
    }
  );
  it.each([
    ['owner', ownerB],
    ['tenant', tenantB],
    ['disposal', null],
  ] as const)('rejects the held receipt after a %s change', async (_kind, next) => {
    const { h, list, verifying } = await manageAfterStartAnother();
    try {
      const generation = h.editor.generation;
      if (next) h.change({ account: next });
      else h.commands.dispose();
      list.resolve(listed([saved]));
      await expect(verifying).resolves.toBeUndefined();
      await drain();
      expect(h.editor.view).toMatchObject({ items: [], readAdmitted: false, active: null });
      expect(h.editor.generation).toBeGreaterThan(generation);
      expectNoWrites();
    } finally {
      h.commands.dispose();
    }
  });
});
