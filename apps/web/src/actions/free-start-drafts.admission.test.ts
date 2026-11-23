import { randomUUID } from 'node:crypto';
import type { FreeStartDraft } from '@interdomestik/database/free-start-drafts';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { captureException } from '@sentry/nextjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import {
  createFreeStartDraftCore,
  deleteFreeStartDraftCore,
  listFreeStartDraftsCore,
  resumeFreeStartDraftCore,
  updateFreeStartDraftCore,
  type FreeStartDraftLifecycleDependencies,
} from './free-start-drafts/lifecycle.core';
import {
  resolveFreeStartDraftSession,
  type FreeStartDraftSessionContext,
} from './free-start-drafts/session.core';

vi.mock('next-intl/server', () => ({ getTranslations: async () => (key: string) => key }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));

const publicIntake = vi.hoisted(() => ({
  authorize: vi.fn(),
  transaction: vi.fn(),
  read: vi.fn(),
}));
vi.mock('@interdomestik/database', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database')>()),
  authorizePublicSiteTenant: publicIntake.authorize,
}));
vi.mock('@interdomestik/database/tenant-authority-context', () => ({
  withTenantAuthority: publicIntake.transaction,
}));
vi.mock('@interdomestik/database/pilot-switch', async importOriginal => ({
  ...(await importOriginal<typeof import('@interdomestik/database/pilot-switch')>()),
  readPilotSwitch: publicIntake.read,
}));
vi.mock('./free-start-drafts/session.core', async importOriginal => {
  const original = await importOriginal<typeof import('./free-start-drafts/session.core')>();
  return { resolveFreeStartDraftSession: vi.fn(original.resolveFreeStartDraftSession) };
});

const headers = new Headers({ host: 'ida.interdomestik.com' });
const context = {
  accessTenantId: 'tenant_ks' as const,
  actorRole: 'member',
  ownerUserId: 'owner-a',
  tenantId: 'tenant_ks' as const,
};
const expectedContext = { ownerUserId: context.ownerUserId, tenantId: context.tenantId };
const facts = { category: 'vehicle', resumeStep: 'details', summary: 'Supported facts.' } as const;
const absentFacts = {
  counterparty: null,
  desiredOutcome: null,
  incidentDate: null,
  issueType: null,
};

function dependencies(
  emailVerified: unknown,
  current: FreeStartDraftSessionContext = context
): FreeStartDraftLifecycleDependencies {
  return {
    createDraft: vi.fn().mockResolvedValue({ ok: false, code: 'limitReached' }),
    deleteDraft: vi.fn(),
    hasClaimEntitlement: vi.fn().mockResolvedValue(false),
    listDrafts: vi.fn(),
    readIntakeOpen: vi.fn().mockResolvedValue(true),
    readPublicIntakeOpen: vi.fn().mockResolvedValue(false),
    resolveSession: vi.fn().mockResolvedValue({ ok: true, context: current, emailVerified }),
    resumeDraft: vi.fn(),
    updateDraft: vi.fn().mockResolvedValue({ ok: false, code: 'notFound' }),
  };
}

function capture(captured: unknown): { expectedContext?: unknown } {
  return captured === undefined ? {} : { expectedContext: captured };
}

function createInput(captured: unknown) {
  return { ...facts, clientRequestId: randomUUID(), ...capture(captured) };
}

function updateInput(captured: unknown) {
  return { ...facts, expectedVersion: 1, id: randomUUID(), ...capture(captured) };
}

async function attemptBoth(deps: FreeStartDraftLifecycleDependencies, captured: unknown) {
  return [
    await createFreeStartDraftCore(headers, createInput(captured), deps),
    await updateFreeStartDraftCore(headers, updateInput(captured), deps),
  ];
}

function expectNoRepositoryCalls(deps: FreeStartDraftLifecycleDependencies) {
  for (const operation of [
    deps.createDraft,
    deps.deleteDraft,
    deps.listDrafts,
    deps.resumeDraft,
    deps.updateDraft,
  ]) {
    expect(operation).not.toHaveBeenCalled();
  }
}

function resolveWithVerdict(emailVerified: unknown) {
  const session = { user: { id: 'owner-a', role: 'member', emailVerified } };
  return resolveFreeStartDraftSession(headers, {
    getSession: vi.fn().mockResolvedValue(session),
    isAllowedHost: () => true,
    resolveDefaultTenantId: () => 'tenant_ks',
    resolveSessionAccessTenantId: () => 'tenant_ks',
  });
}

const unverifiedVerdicts = [false, undefined, 'true', 1];
const sessionVerdicts = [true, false, undefined, 'true'];
const incompleteCaptures = [
  undefined,
  null,
  {},
  { ownerUserId: 'owner-a' },
  { ownerUserId: '', tenantId: 'tenant_ks' },
  { ownerUserId: 'owner-a', tenantId: '   ' },
];
const extraKeyCaptures = [
  { ...expectedContext, accessTenantId: 'tenant_ks' },
  { ...expectedContext, email: 'other@example.test' },
  { ...expectedContext, role: 'admin' },
];
const staleAuthority: { current: FreeStartDraftSessionContext; label: string }[] = [
  { label: 'owner', current: { ...context, ownerUserId: 'owner-b' } },
  {
    label: 'tenant and access tenant',
    current: { ...context, accessTenantId: 'tenant_mk', tenantId: 'tenant_mk' },
  },
  { label: 'tenant only', current: { ...context, tenantId: 'tenant_mk' } },
  { label: 'access tenant only', current: { ...context, accessTenantId: 'tenant_mk' } },
];

describe('anonymous draft intake after an authRequired session verdict', () => {
  beforeEach(() => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'preview');
    vi.stubEnv('VERCEL_TARGET_ENV', 'preview');
    vi.stubEnv('INTERDOMESTIK_DEPLOY_ENV', 'staging');
    vi.stubEnv('INTERDOMESTIK_PRODUCTION', undefined);
    vi.stubEnv('DEFAULT_PUBLIC_TENANT_ID', 'tenant_ks');
    vi.mocked(resolveFreeStartDraftSession).mockResolvedValueOnce({
      ok: false,
      code: 'authRequired',
    });
  });

  afterEach(() => vi.unstubAllEnvs());

  it('returns CLOSED for unresolvable ingress before looking up authority or reading a switch', async () => {
    const request = new Headers({ host: 'unknown.staging.interdomestik.com' });
    await expect(createFreeStartDraftCore(request, createInput(expectedContext))).resolves.toEqual({
      ok: false,
      code: 'CLOSED',
      error: 'draft.CLOSED',
    });
    expect(publicIntake.authorize).not.toHaveBeenCalled();
    expect(publicIntake.transaction).not.toHaveBeenCalled();
    expect(publicIntake.read).not.toHaveBeenCalled();
  });

  it.each([
    ['staging.interdomestik.com', 'tenant_ks'],
    ['mk.staging.interdomestik.com', 'tenant_mk'],
  ])('reads only the resolved intake switch for %s', async (host, tenantId) => {
    const request = new Headers({ host });
    const authority = mintTestTenantAuthority(tenantId);
    const tx = {};
    publicIntake.authorize.mockResolvedValueOnce(authority);
    publicIntake.transaction.mockImplementationOnce((_, effect) => effect(tx));
    publicIntake.read.mockResolvedValueOnce({ state: 'open' });
    await expect(createFreeStartDraftCore(request, createInput(expectedContext))).resolves.toEqual({
      ok: false,
      code: 'authRequired',
    });
    expect(publicIntake.authorize.mock.calls).toEqual([[tenantId]]);
    expect(publicIntake.transaction).toHaveBeenCalledExactlyOnceWith(
      authority,
      expect.any(Function)
    );
    expect(publicIntake.read.mock.calls).toEqual([[tx, tenantId, 'public_intake']]);
  });
});

describe('account draft admission before repository mutation', () => {
  it('closes create and update for a non-entitled owner before parsing, while read and delete still work', async () => {
    const deps = dependencies(true);
    vi.mocked(deps.readIntakeOpen).mockResolvedValue(false);
    vi.mocked(deps.listDrafts).mockResolvedValue({ items: [], nextCursor: null });
    vi.mocked(deps.resumeDraft).mockResolvedValue({ ok: false, code: 'notFound' });
    vi.mocked(deps.deleteDraft).mockResolvedValue({ ok: true, id: randomUUID(), version: 2 });
    const input = {
      get id() {
        throw new Error('input parsed');
      },
    };
    const closed = { ok: false, code: 'CLOSED', error: 'draft.CLOSED' };
    await expect(createFreeStartDraftCore(headers, input, deps)).resolves.toEqual(closed);
    await expect(updateFreeStartDraftCore(headers, input, deps)).resolves.toEqual(closed);
    expect(deps.readIntakeOpen).toHaveBeenCalledTimes(2);
    expect(deps.readIntakeOpen).toHaveBeenCalledWith(context);
    expect(deps.createDraft).not.toHaveBeenCalled();
    expect(deps.updateDraft).not.toHaveBeenCalled();
    await expect(listFreeStartDraftsCore(headers, {}, deps)).resolves.toMatchObject({ ok: true });
    await expect(resumeFreeStartDraftCore(headers, { id: randomUUID() }, deps)).resolves.toEqual({
      ok: false,
      code: 'notFound',
    });
    await expect(
      deleteFreeStartDraftCore(headers, { id: randomUUID(), expectedVersion: 1 }, deps)
    ).resolves.toMatchObject({ ok: true });
    expect(deps.readIntakeOpen).toHaveBeenCalledTimes(2);
  });

  it.each([false, true])('never writes without a session (intake open: %s)', async open => {
    const deps = dependencies(false);
    vi.mocked(deps.resolveSession).mockResolvedValue({ ok: false, code: 'authRequired' });
    vi.mocked(deps.readPublicIntakeOpen).mockResolvedValue(open);
    const refusal = open
      ? { ok: false, code: 'authRequired' }
      : { ok: false, code: 'CLOSED', error: 'draft.CLOSED' };
    expect(await attemptBoth(deps, expectedContext)).toEqual([refusal, refusal]);
    expect(vi.mocked(deps.readPublicIntakeOpen).mock.calls).toEqual([[headers], [headers]]);
    expect(deps.hasClaimEntitlement).not.toHaveBeenCalled();
    expect(deps.readIntakeOpen).not.toHaveBeenCalled();
    expectNoRepositoryCalls(deps);
  });

  it('admits an entitled owner to create and update with closed public intake', async () => {
    const deps = dependencies(true);
    vi.mocked(deps.hasClaimEntitlement).mockResolvedValue(true);
    vi.mocked(deps.readIntakeOpen).mockResolvedValue(false);
    const input = createInput(expectedContext);
    const timestamp = new Date().toISOString();
    const saved: FreeStartDraft = {
      ...facts,
      clientRequestId: input.clientRequestId,
      counterparty: '',
      createdAt: timestamp,
      desiredOutcome: '',
      id: randomUUID(),
      incidentDate: '',
      issueType: '',
      updatedAt: timestamp,
      version: 1,
    };
    const edited = { ...saved, summary: 'Updated facts.', version: 2 };
    vi.mocked(deps.createDraft).mockResolvedValue({ ok: true, idempotent: false, draft: saved });
    vi.mocked(deps.updateDraft).mockResolvedValue({ ok: true, draft: edited });
    await expect(createFreeStartDraftCore(headers, input, deps)).resolves.toEqual({
      ok: true,
      idempotent: false,
      draft: saved,
    });
    const edit = { ...updateInput(expectedContext), id: saved.id, summary: edited.summary };
    await expect(updateFreeStartDraftCore(headers, edit, deps)).resolves.toEqual({
      ok: true,
      draft: edited,
    });
    expect(deps.hasClaimEntitlement).toHaveBeenCalledTimes(2);
    expect(deps.hasClaimEntitlement).toHaveBeenCalledWith(context);
    expect(deps.readIntakeOpen).not.toHaveBeenCalled();
    expect(deps.createDraft).toHaveBeenCalledOnce();
    expect(deps.updateDraft).toHaveBeenCalledOnce();
    expect(deps.updateDraft).toHaveBeenCalledWith(context, {
      ...facts,
      ...absentFacts,
      id: saved.id,
      expectedVersion: saved.version,
      summary: edited.summary,
    });
  });

  it.each([true, false])(
    'falls back to the intake switch after an entitlement error (intake open: %s)',
    async open => {
      const deps = dependencies(true);
      const error = new Error('entitlement lookup failed');
      vi.mocked(deps.hasClaimEntitlement).mockRejectedValue(error);
      vi.mocked(deps.readIntakeOpen).mockResolvedValue(open);

      const results = await attemptBoth(deps, expectedContext);

      expect(captureException).toHaveBeenCalledTimes(2);
      expect(captureException).toHaveBeenCalledWith(error, {
        tags: { operation: 'pilot.freeStartDraftIntake' },
      });
      expect(vi.mocked(deps.readIntakeOpen).mock.calls).toEqual([[context], [context]]);
      if (open) {
        expect(results).toEqual([
          { ok: false, code: 'limitReached' },
          { ok: false, code: 'notFound' },
        ]);
        expect(deps.createDraft).toHaveBeenCalledOnce();
        expect(deps.updateDraft).toHaveBeenCalledOnce();
      } else {
        const closed = { ok: false, code: 'CLOSED', error: 'draft.CLOSED' };
        expect(results).toEqual([closed, closed]);
        expectNoRepositoryCalls(deps);
      }
    }
  );

  it('keeps the closed-intake refusal for an unverified owner', async () => {
    const deps = dependencies(false);
    vi.mocked(deps.hasClaimEntitlement).mockResolvedValue(true);
    vi.mocked(deps.readIntakeOpen).mockResolvedValue(false);
    const closed = { ok: false, code: 'CLOSED', error: 'draft.CLOSED' };
    expect(await attemptBoth(deps, expectedContext)).toEqual([closed, closed]);
    expect(deps.hasClaimEntitlement).not.toHaveBeenCalled();
    expectNoRepositoryCalls(deps);
  });

  it('admits a verified unpaid owner using fresh authority, not client authority', async () => {
    const deps = dependencies(true);
    const input = { ...facts, clientRequestId: randomUUID(), expectedContext };
    expect(await createFreeStartDraftCore(headers, input, deps)).toEqual({
      ok: false,
      code: 'limitReached',
    });
    expect(deps.createDraft).toHaveBeenCalledWith(context, {
      ...facts,
      ...absentFacts,
      clientRequestId: input.clientRequestId,
    });
  });
  it('admits a verified unpaid owner to update with fresh authority', async () => {
    const deps = dependencies(true);
    const input = { ...facts, expectedContext, expectedVersion: 3, id: randomUUID() };
    expect(await updateFreeStartDraftCore(headers, input, deps)).toEqual({
      ok: false,
      code: 'notFound',
    });
    expect(deps.updateDraft).toHaveBeenCalledWith(context, {
      ...facts,
      ...absentFacts,
      expectedVersion: 3,
      id: input.id,
    });
  });
  it.each(unverifiedVerdicts)('rejects verdict %s before create/update', async verdict => {
    const deps = dependencies(verdict);
    expect(await attemptBoth(deps, expectedContext)).toEqual([
      { ok: false, code: 'authRequired' },
      { ok: false, code: 'authRequired' },
    ]);
    expectNoRepositoryCalls(deps);
  });
  it.each(incompleteCaptures)('requires a complete captured context %j', async captured => {
    const deps = dependencies(true);
    expect(await attemptBoth(deps, captured)).toEqual([
      { ok: false, code: 'invalid' },
      { ok: false, code: 'invalid' },
    ]);
    expectNoRepositoryCalls(deps);
  });
  it.each(extraKeyCaptures)('rejects extra captured key in %j', async captured => {
    const deps = dependencies(true);
    expect(await attemptBoth(deps, captured)).toEqual([
      { ok: false, code: 'invalid' },
      { ok: false, code: 'invalid' },
    ]);
    expectNoRepositoryCalls(deps);
  });
  it.each(staleAuthority)('rejects stale $label before create/update', async ({ current }) => {
    const deps = dependencies(true, current);
    expect(await attemptBoth(deps, expectedContext)).toEqual([
      { ok: false, code: 'unavailableAccountContext' },
      { ok: false, code: 'unavailableAccountContext' },
    ]);
    expectNoRepositoryCalls(deps);
  });
  it.each(sessionVerdicts)('keeps Submit/read open for verdict %s', async verdict => {
    expect(await resolveWithVerdict(verdict)).toEqual({
      ok: true,
      context,
      emailVerified: verdict === true,
    });
  });
});
