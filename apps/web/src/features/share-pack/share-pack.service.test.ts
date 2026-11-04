import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  insert: vi.fn(),
  select: vi.fn(),
  values: vi.fn(),
  withTenantContext: vi.fn(),
  resolveSharePackTenant: vi.fn(),
  findPack: vi.fn(),
  canShareAllDocuments: vi.fn(),
}));

vi.mock('@/app/api/documents/share-eligible-documents', () => ({
  canShareAllDocuments: hoisted.canShareAllDocuments,
}));

vi.mock('@interdomestik/database', () => ({
  resolveSharePackTenant: hoisted.resolveSharePackTenant,
  withTenantContext: (
    context: { tenantId: string },
    action: (tx: Record<string, unknown>) => Promise<unknown>
  ) => {
    hoisted.withTenantContext(context);
    return action({
      insert: hoisted.insert,
      query: {
        sharePacks: {
          findFirst: hoisted.findPack,
        },
      },
      select: hoisted.select,
    });
  },
}));

vi.mock('@interdomestik/database/schema', () => ({
  documentAccessLog: {},
  documents: {
    id: 'documents.id',
    tenantId: 'documents.tenantId',
  },
  sharePacks: {
    id: 'sharePacks.id',
    tenantId: 'sharePacks.tenantId',
    expiresAt: 'sharePacks.expiresAt',
    revokedAt: 'sharePacks.revokedAt',
  },
}));

import {
  createSharePack,
  generateShareToken,
  hashShareTokenForAudit,
  getSharePack,
  logAuditEvent,
  verifyShareToken,
} from './share-pack.service';

describe('share-pack.service token security', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    hoisted.insert.mockReturnValue({ values: hoisted.values });
    hoisted.values.mockResolvedValue(undefined);
    process.env = { ...originalEnv };
    process.env.SHARE_PACK_SECRET = 'test-share-secret';
    delete process.env.CI;
    delete process.env.PLAYWRIGHT;
    delete process.env.INTERDOMESTIK_AUTOMATED;
  });

  afterEach(() => {
    process.env = originalEnv;
    vi.clearAllMocks();
  });

  it('signs and verifies share tokens with configured secret', () => {
    const token = generateShareToken({ packId: 'pack-1', tenantId: 'tenant_mk' });

    expect(verifyShareToken(token)).toEqual(
      expect.objectContaining({
        packId: 'pack-1',
        tenantId: 'tenant_mk',
      })
    );
  });

  it('fails fast in production deployment when no signing secret is configured', () => {
    process.env = { ...process.env, NODE_ENV: 'production' };
    delete process.env.SHARE_PACK_SECRET;
    delete process.env.BETTER_AUTH_SECRET;

    expect(() => generateShareToken({ packId: 'pack-1', tenantId: 'tenant_mk' })).toThrow(
      'SHARE_PACK_SECRET or BETTER_AUTH_SECRET is required for share-pack tokens'
    );
    expect(() => verifyShareToken('invalid-token')).toThrow(
      'SHARE_PACK_SECRET or BETTER_AUTH_SECRET is required for share-pack tokens'
    );
  });

  it('uses a non-literal development secret outside production deployment', () => {
    process.env = { ...process.env, NODE_ENV: 'development' };
    delete process.env.SHARE_PACK_SECRET;
    delete process.env.BETTER_AUTH_SECRET;

    const token = generateShareToken({ packId: 'pack-1', tenantId: 'tenant_mk' });

    expect(verifyShareToken(token)).toEqual(
      expect.objectContaining({
        packId: 'pack-1',
        tenantId: 'tenant_mk',
      })
    );
  });

  it('hashes share tokens before storing audit rows', async () => {
    const token = 'raw-share-token';

    const authority = mintTestTenantAuthority('tenant_mk');
    await logAuditEvent({
      authority,
      ids: ['doc-1'],
      shareToken: token,
    });

    expect(hoisted.withTenantContext).toHaveBeenCalledWith(authority);
    expect(hoisted.values).toHaveBeenCalledWith(expect.objectContaining({ tenantId: 'tenant_mk' }));
    expect(hashShareTokenForAudit(token)).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(hoisted.values).toHaveBeenCalledWith(
      expect.objectContaining({
        shareToken: hashShareTokenForAudit(token),
      })
    );
    expect(hoisted.values).not.toHaveBeenCalledWith(
      expect.objectContaining({
        shareToken: token,
      })
    );
  });

  const actor = { id: 'user-1', role: 'member', branchId: null };

  it('creates a share pack under the session tenant authority in one transaction', async () => {
    const authority = mintTestTenantAuthority('tenant_mk');
    hoisted.canShareAllDocuments.mockResolvedValueOnce(true);

    const result = await createSharePack({ authority, actor, documentIds: ['doc-1', 'doc-2'] });

    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(1);
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(authority);
    expect(hoisted.canShareAllDocuments).toHaveBeenCalledWith({
      actor,
      documentIds: ['doc-1', 'doc-2'],
      tenantId: 'tenant_mk',
      tx: expect.objectContaining({ insert: hoisted.insert }),
    });
    expect(hoisted.values).toHaveBeenCalledWith(
      expect.objectContaining({ tenantId: 'tenant_mk', createdByUserId: 'user-1' })
    );
    expect(verifyShareToken(result.token)).toMatchObject({
      packId: result.packId,
      tenantId: 'tenant_mk',
    });
  });

  it('inserts no pack when the actor may not share every document', async () => {
    const authority = mintTestTenantAuthority('tenant_mk');
    hoisted.canShareAllDocuments.mockResolvedValueOnce(false);

    await expect(
      createSharePack({ authority, actor, documentIds: ['doc-1', 'foreign'] })
    ).rejects.toThrow('Invalid IDs');
    expect(hoisted.values).not.toHaveBeenCalled();
  });

  it('inserts no pack when the eligibility check fails', async () => {
    const authority = mintTestTenantAuthority('tenant_mk');
    hoisted.canShareAllDocuments.mockRejectedValueOnce(new Error('read failed'));

    await expect(createSharePack({ authority, actor, documentIds: ['doc-1'] })).rejects.toThrow(
      'read failed'
    );
    expect(hoisted.values).not.toHaveBeenCalled();
  });

  it('reads a shared pack only under the authority its stored pack resolves to', async () => {
    process.env = { ...process.env, SHARE_PACK_SECRET: 'share-pack-test-secret' };
    const token = generateShareToken({ packId: 'pack-1', tenantId: 'tenant_mk' });
    const authority = mintTestTenantAuthority('tenant_mk');
    hoisted.resolveSharePackTenant.mockResolvedValueOnce({ tenantId: 'tenant_mk', authority });
    hoisted.findPack.mockResolvedValueOnce({ id: 'pack-1', documentIds: ['doc-1'] });
    hoisted.select.mockReturnValueOnce({ from: () => ({ where: async () => [{ id: 'doc-1' }] }) });

    const result = await getSharePack({ token });

    expect(hoisted.resolveSharePackTenant).toHaveBeenCalledWith(
      'pack-1',
      'tenant_mk',
      expect.any(Date)
    );
    expect(result?.authority).toBe(authority);
    expect(hoisted.withTenantContext).toHaveBeenCalledTimes(2);
    expect(hoisted.withTenantContext).toHaveBeenNthCalledWith(1, authority);
    expect(hoisted.withTenantContext).toHaveBeenNthCalledWith(2, authority);
  });

  it('reads nothing when the stored pack does not resolve for the signed token', async () => {
    process.env = { ...process.env, SHARE_PACK_SECRET: 'share-pack-test-secret' };
    const token = generateShareToken({ packId: 'pack-1', tenantId: 'tenant_mk' });
    hoisted.resolveSharePackTenant.mockResolvedValueOnce(null);

    await expect(getSharePack({ token })).resolves.toBeNull();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
  });

  it('never resolves a pack for an unsigned or forged token', async () => {
    process.env = { ...process.env, SHARE_PACK_SECRET: 'share-pack-test-secret' };

    await expect(getSharePack({ token: 'not-a-token' })).resolves.toBeNull();
    expect(hoisted.resolveSharePackTenant).not.toHaveBeenCalled();
  });
});
