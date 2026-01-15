import { auth } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getClaimsListV2 } from '@/server/domains/claims';
import { NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const limited = await enforceRateLimit({
    name: 'api/claims',
    limit: 60,
    windowSeconds: 60,
    headers: request.headers,
  });
  if (limited) return limited;

  const session = await auth.api.getSession({ headers: request.headers });

  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const page = Number(searchParams.get('page')) || 1;
  const status = searchParams.get('status') || undefined;
  const search = searchParams.get('search') || undefined;

  // Context extracted in domain function
  // const context: ClaimsAccessContext = { ... }

  try {
    const result = await getClaimsListV2(session, {
      page,
      perPage: 10,
      statusFilter: status as any, // Cast or validate
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
  } catch (error: any) {
    console.error('Claims V2 API Error:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || 'Internal Server Error',
      },
      { status: 500 }
    );
  }
}
