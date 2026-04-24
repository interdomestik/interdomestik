import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  insert: vi.fn(),
  values: vi.fn(),
}));

vi.mock('@interdomestik/database/db', () => ({
  db: {
    insert: hoisted.insert,
    query: {
      sharePacks: {
        findFirst: vi.fn(),
      },
    },
    select: vi.fn(),
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
  generateShareToken,
  hashShareTokenForAudit,
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

    await logAuditEvent({
      tenantId: 'tenant_mk',
      ids: ['doc-1'],
      shareToken: token,
    });

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
});
