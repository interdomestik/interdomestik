import { enforceRateLimit } from '@/lib/rate-limit';
import { authorizeSessionTenant, type AuthorizedSession } from '@/lib/tenant-authority.server';
import { getClaimsListV2 } from '@/server/domains/claims';
import type { ClaimStatusFilter } from '@/server/domains/claims/types';
import { MissingTenantError } from '@interdomestik/shared-auth';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

const CLAIM_STATUS_FILTERS = ['active', 'draft', 'closed'] as const;

function parseStatusFilter(status: string | null): ClaimStatusFilter {
  return CLAIM_STATUS_FILTERS.includes(status as Exclude<ClaimStatusFilter, undefined>)
    ? (status as ClaimStatusFilter)
    : undefined;
}

export async function GET(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/claims',
    limit: 60,
    windowSeconds: 60,
    headers: request.headers,
    productionSensitive: true,
  });
  if (limited) return limited;

  let authorized: AuthorizedSession | null;
  try {
    authorized = await authorizeSessionTenant(request.headers);
  } catch (error: unknown) {
    // A session without a tenant grants no claims list; any other failure is not a denial.
    if (!(error instanceof MissingTenantError)) throw error;
    authorized = null;
  }

  if (!authorized) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  Sentry.setTag('slo_alert', 'd07.api.claims.latency');

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get('page')) || 1;
  const status = parseStatusFilter(searchParams.get('status'));
  const search = searchParams.get('search') || undefined;

  try {
    const result = await getClaimsListV2(authorized, {
      page,
      perPage: 10,
      statusFilter: status,
      search,
    });

    return NextResponse.json({
      success: true,
      claims: result.rows.map(c => ({
        ...c,
        createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
        updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
      })),
      page: result.pagination.page,
      perPage: result.pagination.perPage,
      totalCount: result.pagination.totalCount,
      totalPages: result.pagination.totalPages,
      totals: result.totals,
    });
  } catch (error: unknown) {
    console.error('Claims V2 API Error:', error);
    const message = error instanceof Error ? error.message : 'Internal Server Error';
    return NextResponse.json(
      {
        success: false,
        error: message,
      },
      { status: 500 }
    );
  }
}
