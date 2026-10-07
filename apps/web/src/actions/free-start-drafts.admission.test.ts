import { randomUUID } from 'node:crypto';
import { describe, expect, it, vi } from 'vitest';

import {
  createFreeStartDraftCore,
  updateFreeStartDraftCore,
  type FreeStartDraftLifecycleDependencies,
} from './free-start-drafts/lifecycle.core';
import {
  resolveFreeStartDraftSession,
  type FreeStartDraftSessionContext,
} from './free-start-drafts/session.core';

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
    listDrafts: vi.fn(),
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

describe('account draft admission before repository mutation', () => {
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
