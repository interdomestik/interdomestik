import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { afterEach, describe, expect, it, vi } from 'vitest';

const { withTenantAuthority, resolveClaimStatusActor } = vi.hoisted(() => ({
  withTenantAuthority: vi.fn(),
  resolveClaimStatusActor: vi.fn(),
}));

vi.mock('@interdomestik/database/tenant-authority-context', () => ({ withTenantAuthority }));
vi.mock('./status-actor', () => ({ resolveClaimStatusActor }));

import { getServiceLevelReport } from './service-level-report';

const authority = {} as TenantAuthority;

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
});

describe('getServiceLevelReport', () => {
  it.each([undefined, 'not a date'])('refuses to compute with reporting start %s', async value => {
    vi.stubEnv('SERVICE_LEVEL_REPORTING_START', value);

    await expect(getServiceLevelReport(authority)).resolves.toEqual({
      ok: false,
      code: 'reporting_start_unset',
    });
    expect(withTenantAuthority).not.toHaveBeenCalled();
  });

  it('counts earlier handoffs separately from unanswered requests', async () => {
    vi.stubEnv('SERVICE_LEVEL_REPORTING_START', '2026-11-20T00:00:00Z');
    resolveClaimStatusActor.mockReturnValue({ kind: 'admin', tenantId: 'tenant' });
    const where = vi
      .fn()
      .mockResolvedValueOnce([
        {
          requestedAt: new Date('2026-11-20T14:59:00Z'),
          answeredAt: new Date('2026-11-23T15:00:00Z'),
        },
        {
          requestedAt: new Date('2026-11-20T14:59:00Z'),
          answeredAt: new Date('2026-11-23T15:00:01Z'),
        },
      ])
      .mockResolvedValueOnce([
        { requestedAt: new Date('2026-11-19T11:00:00Z'), answeredAt: null },
        { requestedAt: new Date('2026-11-20T11:00:00Z'), answeredAt: null },
      ]);
    withTenantAuthority.mockImplementation((_, run) =>
      run({ select: () => ({ from: () => ({ where }) }) })
    );

    await expect(getServiceLevelReport(authority)).resolves.toEqual({
      ok: true,
      reportingStart: '2026-11-20T00:00:00.000Z',
      claims: { beforeReportingStart: 0, onTime: 1, late: 1, unanswered: 0 },
      supportHandoffs: { beforeReportingStart: 1, onTime: 0, late: 0, unanswered: 1 },
    });
  });
});
