import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { randomUUID } from 'node:crypto';
import { vi } from 'vitest';
import { hasAdmittedClaimEntitlement } from './free-start-drafts/claim-entitlement.core';
import { resolveFreeStartDraftSession } from './free-start-drafts/session.core';

vi.mock('next-intl/server', () => ({
  getTranslations: () => Promise.resolve((key: string) => key),
}));
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

export { publicIntake };

export const headers = new Headers({ host: 'ida.interdomestik.com' });
export const context = {
  accessTenantId: 'tenant_ks' as const,
  actorRole: 'member',
  ownerUserId: 'owner-a',
  tenantId: 'tenant_ks' as const,
};
export const expectedContext = { ownerUserId: context.ownerUserId, tenantId: context.tenantId };
export const facts = {
  category: 'vehicle',
  resumeStep: 'details',
  summary: 'Supported facts.',
} as const;

function capture(captured: unknown): { expectedContext?: unknown } {
  return captured === undefined ? {} : { expectedContext: captured };
}

export function createInput(captured: unknown) {
  return { ...facts, clientRequestId: randomUUID(), ...capture(captured) };
}

export function updateInput(captured: unknown) {
  return { ...facts, expectedVersion: 1, id: randomUUID(), ...capture(captured) };
}

vi.mock('./free-start-drafts/claim-entitlement.core', () => ({
  hasAdmittedClaimEntitlement: vi.fn().mockResolvedValue(false),
}));
export const entitlement = vi.mocked(hasAdmittedClaimEntitlement);

export function resolveWithVerdict(emailVerified: unknown) {
  const session = { user: { id: 'owner-a', role: 'member', emailVerified } };
  return resolveFreeStartDraftSession(headers, {
    getSession: vi.fn().mockResolvedValue(session),
    admitMember: vi.fn().mockResolvedValue({
      ok: true,
      authorized: {
        session: { user: { id: 'owner-a', role: 'member', tenantId: 'tenant_ks' } },
        authority: mintTestTenantAuthority('tenant_ks', { userId: 'owner-a', role: 'member' }),
      },
    }),
    isAllowedHost: () => true,
    resolveDefaultTenantId: () => 'tenant_ks',
    resolveSessionAccessTenantId: () => 'tenant_ks',
  });
}
