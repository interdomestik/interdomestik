import type { TenantTransaction } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  select: vi.fn(),
  locale: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  desc: vi.fn((column: unknown) => ({ op: 'desc', column })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  inArray: vi.fn((left: unknown, right: unknown) => ({ op: 'inArray', left, right })),
}));

import { baseParams, orderedRowsChain } from './getMemberVaultConsentDisplay.test-support';

const schema = vi.hoisted(() => ({
  tenants: { id: 'tenants.id', code: 'tenants.code', countryCode: 'tenants.countryCode' },
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

vi.mock('@interdomestik/database', () => ({
  db: { select: hoisted.select },
}));
vi.mock('@interdomestik/database/tenant-directory', () => ({
  readTenantLocaleMetadata: hoisted.locale,
}));
vi.mock('@interdomestik/database/schema', () => schema);
vi.mock('drizzle-orm', () => ({
  and: hoisted.and,
  desc: hoisted.desc,
  eq: hoisted.eq,
  inArray: hoisted.inArray,
}));

import { getMemberVaultConsentDisplay } from './getMemberVaultConsentDisplay';

describe('getMemberVaultConsentDisplay predicates', () => {
  beforeEach(() => vi.clearAllMocks());

  it('uses administrative metadata but the supplied RLS transaction for documents and consents', async () => {
    hoisted.locale.mockResolvedValueOnce({ code: 'MK', countryCode: 'MK' });
    const select = vi
      .fn()
      .mockReturnValueOnce(
        orderedRowsChain([{ id: 'document-1', category: 'evidence', createdAt: null }])
      )
      .mockReturnValueOnce(orderedRowsChain([]));
    const tx = { select } as unknown as TenantTransaction;
    await getMemberVaultConsentDisplay(baseParams, tx);
    expect(hoisted.locale).toHaveBeenCalledWith(baseParams.tenantId);
    expect(hoisted.select).not.toHaveBeenCalled();
    expect(select).toHaveBeenCalledTimes(2);
  });

  it('skips consent reads when no eligible evidence exists', async () => {
    const documents = orderedRowsChain([]);
    hoisted.locale.mockResolvedValueOnce({ code: 'MK', countryCode: 'MK' });
    hoisted.select.mockReturnValueOnce(documents);

    await expect(getMemberVaultConsentDisplay(baseParams)).resolves.toEqual({
      kind: 'ready',
      items: [],
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
