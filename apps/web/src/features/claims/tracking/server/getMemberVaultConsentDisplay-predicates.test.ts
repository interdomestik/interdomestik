import type { TenantTransaction } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  select: vi.fn(),
  withTenantContext: vi.fn(),
  locale: vi.fn(),
  admit: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  desc: vi.fn((column: unknown) => ({ op: 'desc', column })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  inArray: vi.fn((left: unknown, right: unknown) => ({ op: 'inArray', left, right })),
}));

import {
  baseAuthority,
  baseParams,
  baseTenantId,
  orderedRowsChain,
} from './getMemberVaultConsentDisplay.test-support';

const schema = vi.hoisted(() => ({
  tenants: { id: 'tenants.id', code: 'tenants.code', countryCode: 'tenants.countryCode' },
  claims: { tenantId: 'claim.tenantId', id: 'claim.id', userId: 'claim.userId' },
  claimDocuments: {
    id: 'documents.id',
    tenantId: 'documents.tenantId',
    claimId: 'documents.claimId',
    category: 'documents.category',
    createdAt: 'documents.createdAt',
  },
  claimDocumentAiExtractionConsents: {
    id: 'consents.id',
    tenantId: 'consents.tenantId',
    subjectId: 'consents.subjectId',
    claimId: 'consents.claimId',
    documentId: 'consents.documentId',
    consentType: 'consents.consentType',
    processingPurpose: 'consents.processingPurpose',
    status: 'consents.status',
    recordedAt: 'consents.recordedAt',
    privacyVersion: 'consents.privacyVersion',
  },
}));

vi.mock('@/lib/privacy/require-member-acceptance', () => ({
  requireAdmittedMember: hoisted.admit,
}));

vi.mock('@interdomestik/database', () => ({
  db: { select: hoisted.select },
  withTenantContext: hoisted.withTenantContext,
}));
vi.mock('@interdomestik/database/tenant-directory', () => ({
  readTenantLocaleMetadata: hoisted.locale,
}));
vi.mock('@interdomestik/database/schema', () => schema);
vi.mock('drizzle-orm', async importOriginal => ({
  ...(await importOriginal<typeof import('drizzle-orm')>()),
  and: hoisted.and,
  desc: hoisted.desc,
  eq: hoisted.eq,
  inArray: hoisted.inArray,
}));

import {
  completeMemberVaultConsentDisplay,
  getMemberVaultConsentDisplay,
} from './getMemberVaultConsentDisplay';

describe('getMemberVaultConsentDisplay predicates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.admit.mockResolvedValue({ ok: true, authorized: { authority: baseAuthority } });
    hoisted.withTenantContext.mockImplementation(
      async (_context: unknown, callback: (tx: unknown) => unknown) =>
        callback({ select: hoisted.select })
    );
  });

  const openGate = {
    open: true as const,
    display: { kind: 'ready' as const, items: [] },
    tenantId: baseTenantId,
    viewerId: 'member-1',
    tenant: { code: 'MK', countryCode: 'MK' },
  };

  it('completes with the supplied RLS transaction and evidence, reading only consents', async () => {
    const consents = orderedRowsChain([]);
    const select = vi.fn().mockReturnValueOnce(consents);
    const database = { select } as unknown as TenantTransaction;
    const evidence = [{ id: 'document-1', category: 'evidence' as const, createdAt: null }];
    await completeMemberVaultConsentDisplay(baseParams, openGate, database, evidence);
    expect(hoisted.admit).not.toHaveBeenCalled();
    expect(hoisted.locale).not.toHaveBeenCalled();
    expect(hoisted.select).not.toHaveBeenCalled();
    expect(hoisted.withTenantContext).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledTimes(1);
    const consentWhere = consents.where.mock.calls[0]?.[0] as { args: unknown[] };
    expect(consentWhere.args).toContainEqual({
      op: 'eq',
      left: 'consents.tenantId',
      right: baseTenantId,
    });
    expect(consentWhere.args).toContainEqual({
      op: 'inArray',
      left: 'consents.documentId',
      right: ['document-1'],
    });
  });

  it('completes without a consent read when the supplied evidence is empty', async () => {
    const select = vi.fn();
    const database = { select } as unknown as TenantTransaction;
    await expect(
      completeMemberVaultConsentDisplay(baseParams, openGate, database, [])
    ).resolves.toEqual({ kind: 'ready', items: [] });
    expect(select).not.toHaveBeenCalled();
  });

  it('skips consent reads when no eligible evidence exists', async () => {
    const documents = orderedRowsChain([]);
    hoisted.locale.mockResolvedValueOnce({ code: 'MK', countryCode: 'MK' });
    hoisted.select.mockReturnValueOnce(documents);

    await expect(getMemberVaultConsentDisplay(baseParams)).resolves.toEqual({
      kind: 'ready',
      items: [],
    });
    expect(hoisted.withTenantContext).toHaveBeenCalledWith(baseAuthority, expect.any(Function));
    expect(documents.innerJoin).toHaveBeenCalledWith(schema.claims, {
      op: 'and',
      args: [
        { op: 'eq', left: 'claim.tenantId', right: 'documents.tenantId' },
        { op: 'eq', left: 'claim.id', right: 'documents.claimId' },
        { op: 'eq', left: 'claim.userId', right: 'member-1' },
      ],
    });
    expect(documents.where).toHaveBeenCalledWith({
      op: 'and',
      args: [
        { op: 'eq', left: 'documents.tenantId', right: 'tenant-mk' },
        { op: 'eq', left: 'documents.claimId', right: 'claim-1' },
        { op: 'eq', left: 'documents.category', right: 'evidence' },
      ],
    });
    expect(documents.orderBy).toHaveBeenCalledWith(
      { op: 'desc', column: 'documents.createdAt' },
      { op: 'desc', column: 'documents.id' }
    );
    expect(hoisted.select).toHaveBeenCalledTimes(1);
  });

  it('uses the full member consent scope and deterministic ordering', async () => {
    const document = { id: 'document-1', category: 'evidence', createdAt: null };
    const documents = orderedRowsChain([document]);
    const consents = orderedRowsChain([]);
    hoisted.locale.mockResolvedValueOnce({ code: 'MK', countryCode: 'MK' });
    hoisted.select.mockReturnValueOnce(documents).mockReturnValueOnce(consents);

    await getMemberVaultConsentDisplay(baseParams);

    expect(documents.orderBy).toHaveBeenCalledWith(
      { op: 'desc', column: 'documents.createdAt' },
      { op: 'desc', column: 'documents.id' }
    );

    const consentWhere = consents.where.mock.calls[0]?.[0] as { args: unknown[] };
    expect(consentWhere.args).toEqual(
      expect.arrayContaining([
        { op: 'eq', left: 'consents.tenantId', right: 'tenant-mk' },
        { op: 'eq', left: 'consents.subjectId', right: 'member-1' },
        { op: 'eq', left: 'consents.claimId', right: 'claim-1' },
        { op: 'inArray', left: 'consents.documentId', right: ['document-1'] },
        { op: 'eq', left: 'consents.consentType', right: 'ai_document_extraction' },
        { op: 'eq', left: 'consents.processingPurpose', right: 'ai_document_extraction' },
      ])
    );
    expect(consents.orderBy).toHaveBeenCalledWith(
      { op: 'desc', column: 'consents.recordedAt' },
      { op: 'desc', column: 'consents.id' }
    );
  });
});
