import { supportHandoffFirstResponses } from '@interdomestik/database/schema';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { PgDialect } from 'drizzle-orm/pg-core';
import type { SQL } from 'drizzle-orm';
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
    const leftJoin = vi.fn((_table: unknown, _on: SQL) => ({ where }));
    withTenantAuthority.mockImplementation((_, run) =>
      run({ select: () => ({ from: () => ({ where, leftJoin }) }) })
    );

    await expect(getServiceLevelReport(authority)).resolves.toEqual({
      ok: true,
      reportingStart: '2026-11-20T00:00:00.000Z',
      claims: { beforeReportingStart: 0, onTime: 1, late: 1, unanswered: 0 },
      supportHandoffs: { beforeReportingStart: 1, onTime: 0, late: 0, unanswered: 1 },
    });
    // A handoff without a first-response row stays in the report, as unanswered.
    expect(leftJoin).toHaveBeenCalledOnce();
    const [joined, on] = leftJoin.mock.calls[0];
    expect(joined).toBe(supportHandoffFirstResponses);
    expect(new PgDialect().sqlToQuery(on).sql).toBe(
      '("support_handoff_first_responses"."tenant_id" = "support_handoffs"."tenant_id" and ' +
        '"support_handoff_first_responses"."handoff_id" = "support_handoffs"."id")'
    );
  });
});
