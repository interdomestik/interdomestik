import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getClaimsListV2 } from '@/server/domains/claims';
import type { ClaimStatusFilter } from '@/server/domains/claims/types';
import * as Sentry from '@sentry/nextjs';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

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

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  Sentry.setTag('slo_alert', 'd07.api.claims.latency');

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get('page')) || 1;
  const status = parseStatusFilter(searchParams.get('status'));
  const search = searchParams.get('search') || undefined;

  // Context extracted in domain function
  // const context: ClaimsAccessContext = { ... }

  try {
    const result = await getClaimsListV2(session, {
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
