import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  agentScope: vi.fn(),
  createTenantSignedUploadUrl: vi.fn(),
  findClaimFirst: vi.fn(),
  tx: {} as { query: { claims: { findFirst: (...args: unknown[]) => unknown } } },
}));
hoisted.tx.query = { claims: { findFirst: (...args) => hoisted.findClaimFirst(...args) } };

vi.mock('@interdomestik/database', () => ({
  and: vi.fn(),
  claims: { id: 'id', tenantId: 'tenant_id' },
  db: { query: { claims: { findFirst: hoisted.findClaimFirst } } },
  eq: vi.fn(),
  withTenantContext: async (_context: unknown, callback: (tx: unknown) => unknown) =>
    callback(hoisted.tx),
}));
vi.mock('@/lib/db/access-tenant-predicate', () => ({ matchesAccessTenant: vi.fn() }));
vi.mock('@/app/api/documents/agent-document-scope', () => ({
  hasAgentClaimDocumentScope: hoisted.agentScope,
}));
vi.mock('@/lib/storage/service-role', () => ({
  createTenantSignedUploadUrl: hoisted.createTenantSignedUploadUrl,
}));
vi.mock('nanoid', () => ({ nanoid: () => 'evidence-123' }));

import { createSignedUploadCore } from './_core';

const CLAIM = {
  id: 'claim-1',
  tenantId: 'tenant-ks',
  userId: 'member-1',
  agentId: 'agent-1',
  branchId: 'branch-a',
};

function upload(user: { id: string; role?: string }, claimId?: string) {
  return createSignedUploadCore({
    authority: mintTestTenantAuthority('tenant-ks', { userId: user.id, role: user.role }),
    bucket: 'claim-evidence',
    input: { claimId, fileName: 'proof.pdf', fileSize: 10, fileType: 'application/pdf' },
    session: { user: { ...user, tenantId: 'tenant-ks' } },
  });
}

describe('createSignedUploadCore role and agent scope', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv('CLAIM_UPLOAD_INTENT_SECRET', 'test-upload-intent-secret-value-123456');
    hoisted.findClaimFirst.mockResolvedValue(CLAIM);
    hoisted.agentScope.mockResolvedValue(true);
    hoisted.createTenantSignedUploadUrl.mockResolvedValue({
      data: { token: 'tok', signedUrl: 'https://signed.example/upload' },
      error: null,
    });
  });

  it.each(['member', 'user', 'agent'])('signs an initial upload for a %s', async role => {
    const result = await upload({ id: 'actor-1', role });

    expect(result.ok).toBe(true);
    expect(hoisted.createTenantSignedUploadUrl).toHaveBeenCalledTimes(1);
  });

  it.each([
    'auditor',
    'global_support',
    'staff',
    'branch_manager',
    'tenant_admin',
    'admin',
    'super_admin',
    'unknown',
    undefined,
  ])('gives a %s no initial upload capability', async role => {
    await expect(upload({ id: 'actor-1', role })).resolves.toEqual({
      ok: false,
      status: 403,
      error: 'Forbidden',
    });
    expect(hoisted.createTenantSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('signs the owner upload to its own claim without an agent lookup', async () => {
    const result = await upload({ id: 'member-1', role: 'member' }, 'claim-1');

    expect(result.ok).toBe(true);
    expect(hoisted.agentScope).not.toHaveBeenCalled();
  });

  it('signs an attributed agent upload only within its scope', async () => {
    expect((await upload({ id: 'agent-1', role: 'agent' }, 'claim-1')).ok).toBe(true);
    expect(hoisted.agentScope).toHaveBeenCalledWith({
      agentId: 'agent-1',
      claim: { agentId: 'agent-1', branchId: 'branch-a', ownerId: 'member-1' },
      db: hoisted.tx,
      tenantId: 'tenant-ks',
    });

    vi.clearAllMocks();
    hoisted.findClaimFirst.mockResolvedValue(CLAIM);
    hoisted.agentScope.mockResolvedValue(false);
    await expect(upload({ id: 'agent-1', role: 'agent' }, 'claim-1')).resolves.toMatchObject({
      status: 403,
    });
    expect(hoisted.createTenantSignedUploadUrl).not.toHaveBeenCalled();
  });

  it.each([
    ['a read-only owner', { id: 'member-1', role: 'auditor' }],
    ['staff on a member claim', { id: 'staff-1', role: 'staff' }],
    ['a member on another member claim', { id: 'member-2', role: 'member' }],
  ])('refuses %s', async (_label, user) => {
    await expect(upload(user, 'claim-1')).resolves.toMatchObject({ status: 403 });
    expect(hoisted.agentScope).not.toHaveBeenCalled();
    expect(hoisted.createTenantSignedUploadUrl).not.toHaveBeenCalled();
  });

  it('lets an agent upload to a claim it owns as a member', async () => {
    hoisted.findClaimFirst.mockResolvedValue({ ...CLAIM, userId: 'agent-1' });

    expect((await upload({ id: 'agent-1', role: 'agent' }, 'claim-1')).ok).toBe(true);
    expect(hoisted.agentScope).not.toHaveBeenCalled();
  });

  it.each(['admin', 'auditor', 'member', 'agent', undefined])(
    'keeps a missing or foreign claim a 404 for a %s',
    async role => {
      hoisted.findClaimFirst.mockResolvedValue(undefined);

      await expect(upload({ id: 'actor-1', role }, 'claim-x')).resolves.toEqual({
        ok: false,
        status: 404,
        error: 'Claim not found',
      });
      expect(hoisted.createTenantSignedUploadUrl).not.toHaveBeenCalled();
    }
  );
});
