import {
  claimResponseRequests,
  supportHandoffFirstResponses,
  supportHandoffs,
} from '@interdomestik/database';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';

import { answeredOnTime } from './service-level';
import { resolveClaimStatusActor } from './status-actor';

type ReportCounts = {
  beforeReportingStart: number;
  onTime: number;
  late: number;
  unanswered: number;
};
type ReportRow = { requestedAt: Date; answeredAt: Date | null };

export type ServiceLevelReportResult =
  | { ok: false; code: 'reporting_start_unset' | 'forbidden_role' }
  | { ok: true; reportingStart: string; claims: ReportCounts; supportHandoffs: ReportCounts };

const reportingStartFormat = z.union([z.iso.date(), z.iso.datetime({ offset: true })]);

function countResponses(rows: ReportRow[], reportingStart: Date): ReportCounts {
  const counts = { beforeReportingStart: 0, onTime: 0, late: 0, unanswered: 0 };
  for (const row of rows) {
    if (row.requestedAt < reportingStart) counts.beforeReportingStart++;
    else if (row.answeredAt === null) counts.unanswered++;
    else if (answeredOnTime(row.requestedAt, row.answeredAt)) counts.onTime++;
    else counts.late++;
  }
  return counts;
}

export async function getServiceLevelReport(
  authority: TenantAuthority
): Promise<ServiceLevelReportResult> {
  const configuredStart = reportingStartFormat.safeParse(process.env.SERVICE_LEVEL_REPORTING_START);
  if (!configuredStart.success) return { ok: false, code: 'reporting_start_unset' };
  const reportingStart = new Date(configuredStart.data);
  if (!Number.isFinite(reportingStart.getTime()))
    return { ok: false, code: 'reporting_start_unset' };

  const actor = resolveClaimStatusActor(authority);
  if (actor?.kind !== 'admin') return { ok: false, code: 'forbidden_role' };

  return withTenantAuthority(authority, async tx => {
    // db-access-guard: tenant-scoped -- reason: tenant from the validated report authority.
    const requests = await tx
      .select({
        requestedAt: claimResponseRequests.requestedAt,
        answeredAt: claimResponseRequests.answeredAt,
      })
      .from(claimResponseRequests)
      .where(withTenant(actor.tenantId, claimResponseRequests.tenantId));
    // db-access-guard: tenant-scoped -- reason: tenant from the validated report authority.
    const handoffs = await tx
      .select({
        requestedAt: supportHandoffs.createdAt,
        answeredAt: supportHandoffFirstResponses.firstPublicResponseAt,
      })
      .from(supportHandoffs)
      .leftJoin(
        supportHandoffFirstResponses,
        and(
          eq(supportHandoffFirstResponses.tenantId, supportHandoffs.tenantId),
          eq(supportHandoffFirstResponses.handoffId, supportHandoffs.id)
        )
      )
      .where(withTenant(actor.tenantId, supportHandoffs.tenantId));
    return {
      ok: true,
      reportingStart: reportingStart.toISOString(),
      claims: countResponses(requests, reportingStart),
      supportHandoffs: countResponses(handoffs, reportingStart),
    };
  });
}
