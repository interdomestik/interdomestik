import type { TenantTransaction } from '@interdomestik/database';
import type { TenantLocaleMetadata } from '@interdomestik/database/tenant-directory';
import type { VaultConsentDisplay } from '@interdomestik/domain-claims';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  baseAuthority,
  baseParams,
  orderedRowsChain,
} from './getMemberVaultConsentDisplay.test-support';

const mocks = vi.hoisted(() => ({ locale: vi.fn(), select: vi.fn(), context: vi.fn() }));
vi.mock('@interdomestik/database', () => ({
  db: { select: mocks.select },
  withTenantContext: mocks.context,
}));
vi.mock('@interdomestik/database/tenant-directory', () => ({
  readTenantLocaleMetadata: mocks.locale,
}));

import { getMemberVaultConsentDisplay } from './getMemberVaultConsentDisplay';

const mk = { code: 'MK', countryCode: 'MK' };
const createdAt = new Date('2026-01-01T00:00:00Z');
const recordedAt = new Date('2026-01-02T00:00:00Z');

describe('preloaded member vault locale metadata', () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  it.each<{
    tenant: TenantLocaleMetadata | null;
    piiStatus: typeof baseParams.piiStatus | 'erased_or_unavailable';
    category: string;
    expected: VaultConsentDisplay;
  }>([
    { tenant: null, piiStatus: 'available', category: 'vehicle', expected: { kind: 'hidden' } },
    {
      tenant: { code: 'KS', countryCode: 'KS' },
      piiStatus: 'available',
      category: 'vehicle',
      expected: { kind: 'hidden' },
    },
    {
      tenant: { code: 'MK', countryCode: 'AL' },
      piiStatus: 'available',
      category: 'vehicle',
      expected: { kind: 'hidden' },
    },
    { tenant: mk, piiStatus: 'available', category: 'injury', expected: { kind: 'hidden' } },
    {
      tenant: mk,
      piiStatus: 'erased_or_unavailable',
      category: 'property',
      expected: { kind: 'subject_erased' },
    },
  ])(
    'preserves $expected.kind for $tenant / $category / $piiStatus without a lookup',
    async ({ tenant, piiStatus, category, expected }) => {
      const params = { ...baseParams, piiStatus, claimCategory: category };
      mocks.locale.mockResolvedValue(tenant);
      const baseline = await getMemberVaultConsentDisplay(params, baseAuthority);
      mocks.locale.mockClear();
      const tx = { select: mocks.select } as unknown as TenantTransaction;

      const result = await getMemberVaultConsentDisplay(params, baseAuthority, tx, tenant);

      expect(result).toEqual(expected);
      expect(result).toEqual(baseline);
      expect(mocks.locale).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.context).not.toHaveBeenCalled();
    }
  );

  it.each(['accepted', 'withdrawn', 'missing'] as const)(
    'preserves rendered %s consent from transaction-bound rows',
    async status => {
      const document = { id: 'document-1', category: 'evidence', createdAt };
      const consents =
        status === 'missing'
          ? []
          : [
              {
                id: 'consent-1',
                documentId: document.id,
                consentType: 'ai_document_extraction',
                processingPurpose: 'ai_document_extraction',
                status,
                recordedAt,
                privacyVersion: 'v1',
              },
            ];
      const select = vi
        .fn()
        .mockReturnValueOnce(orderedRowsChain([document]))
        .mockReturnValueOnce(orderedRowsChain(consents))
        .mockReturnValueOnce(orderedRowsChain([document]))
        .mockReturnValueOnce(orderedRowsChain(consents));
      const tx = { select } as unknown as TenantTransaction;
      mocks.locale.mockResolvedValue(mk);
      const baseline = await getMemberVaultConsentDisplay(baseParams, baseAuthority, tx);
      mocks.locale.mockClear();

      const result = await getMemberVaultConsentDisplay(baseParams, baseAuthority, tx, mk);

      expect(result).toEqual(baseline);
      expect(result).toEqual({
        kind: 'ready',
        items: [
          {
            category: 'evidence',
            updatedAt: status === 'missing' ? createdAt : recordedAt,
            consentStatus: status,
            consentRecordedAt: status === 'missing' ? null : recordedAt,
            consentVersion: status === 'accepted' ? 'v1' : null,
          },
        ],
      });
      expect(select).toHaveBeenCalledTimes(4);
      expect(mocks.locale).not.toHaveBeenCalled();
      expect(mocks.select).not.toHaveBeenCalled();
      expect(mocks.context).not.toHaveBeenCalled();
    }
  );
});
