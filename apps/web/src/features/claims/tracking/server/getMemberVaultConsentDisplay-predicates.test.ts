import { beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  select: vi.fn(),
  and: vi.fn((...args: unknown[]) => ({ op: 'and', args })),
  desc: vi.fn((column: unknown) => ({ op: 'desc', column })),
  eq: vi.fn((left: unknown, right: unknown) => ({ op: 'eq', left, right })),
  inArray: vi.fn((left: unknown, right: unknown) => ({ op: 'inArray', left, right })),
}));

import {
  baseParams,
  orderedRowsChain,
  rowsChain,
  tenantChain,
} from './getMemberVaultConsentDisplay.test-support';

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

vi.mock('@interdomestik/database', () => ({ db: { select: hoisted.select } }));
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

  it('skips consent reads when no eligible evidence exists', async () => {
    const documents = rowsChain([]);
    hoisted.select
      .mockReturnValueOnce(tenantChain([{ code: 'MK', countryCode: 'MK' }]))
      .mockReturnValueOnce(documents);

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
    expect(hoisted.select).toHaveBeenCalledTimes(2);
  });

  it('uses the full member consent scope and deterministic ordering', async () => {
    const document = { id: 'document-1', category: 'evidence', createdAt: null };
    const documents = rowsChain([document]);
    const consents = orderedRowsChain([]);
    hoisted.select
      .mockReturnValueOnce(tenantChain([{ code: 'MK', countryCode: 'MK' }]))
      .mockReturnValueOnce(documents)
      .mockReturnValueOnce(consents);

    await getMemberVaultConsentDisplay(baseParams);

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
