import { authorizePublicSiteTenant } from '@interdomestik/database';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  dbEntry,
  txEntry,
  resetCommercialActionMocks,
  withTenantContextMock,
} from '@/lib/commercial-action-idempotency-test-support';
import { submitFreeStartIntakeCore } from './submit.core';

const rate = vi.hoisted(() => vi.fn());
vi.mock('@interdomestik/database', async () =>
  (await import('@/lib/commercial-action-idempotency-test-support')).databaseModuleMock()
);
vi.mock('@/lib/rate-limit', () => ({ enforceRateLimitForAction: rate }));
vi.mock('@sentry/nextjs', () => ({ captureException: vi.fn() }));
const data = {
  category: 'vehicle',
  issueType: 'collision',
  desiredOutcome: 'repair',
  counterparty: 'Insurer',
  incidentDate: '2026-11-01',
  summary: 'A vehicle collision requiring repair.',
} as const;

describe('free-start inactive technical partition', () => {
  beforeEach(() => resetCommercialActionMocks());
  it.each(['keyed', 'unkeyed'])(
    'refuses %s intake before any effect when KS is inactive',
    async mode => {
      vi.mocked(authorizePublicSiteTenant).mockResolvedValueOnce(null);
      expect(
        await submitFreeStartIntakeCore({
          requestHeaders: new Headers({ host: 'mk.interdomestik.com' }),
          idempotencyKey: mode === 'keyed' ? 'inactive-key' : undefined,
          data,
        })
      ).toMatchObject({ success: false, code: 'IDEMPOTENCY_TENANT_SCOPE_REQUIRED' });
      expect(authorizePublicSiteTenant).toHaveBeenCalledExactlyOnceWith('tenant_ks');
      expect(rate).not.toHaveBeenCalled();
      expect(withTenantContextMock).not.toHaveBeenCalled();
      for (const effect of [...Object.values(dbEntry), ...Object.values(txEntry)]) {
        expect(effect).not.toHaveBeenCalled();
      }
    }
  );
});
