import { auth } from '@/lib/auth';
import {
  and,
  claimMessages,
  claims,
  db,
  eq,
  ilike,
  inArray,
  or,
  user,
} from '@interdomestik/database';
import { count, desc, isNull } from 'drizzle-orm';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

const VALID_STATUSES = [
  'draft',
  'submitted',
  'verification',
  'evaluation',
  'negotiation',
  'court',
  'resolved',
  'rejected',
] as const;

const MAX_PER_PAGE = 50;

function clampPage(value: number) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

function clampPerPage(value: number, fallback: number) {
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), MAX_PER_PAGE);
}

export async function GET(request: Request) {
  const requestHeaders = await headers();
  const session = await auth.api.getSession({ headers: requestHeaders });

  if (!session) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 401 });
  }

  const url = new URL(request.url);
  const scopeParam = url.searchParams.get('scope') || 'member';
  const statusFilter = url.searchParams.get('status') || undefined;
  const searchQuery = url.searchParams.get('search') || undefined;
  const page = clampPage(Number(url.searchParams.get('page') || 1));
  const perPage = clampPerPage(Number(url.searchParams.get('perPage') || 10), 10);

  const role = session.user.role || 'user';
  const isAdmin = role === 'admin';
  const isStaff = role === 'staff';

  let scope: 'member' | 'admin' | 'staff_queue' = 'member';
  if (scopeParam === 'admin') scope = 'admin';
  if (scopeParam === 'agent_queue' || scopeParam === 'staff_queue') scope = 'staff_queue';

  if (scope === 'admin' && !isAdmin) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
  }

  if (scope === 'staff_queue' && !isAdmin && !isStaff) {
    return NextResponse.json({ success: false, error: 'Unauthorized' }, { status: 403 });
  }

  const conditions: any[] = [];

  if (scope === 'member') {
    conditions.push(eq(claims.userId, session.user.id));
  }

  if (scope === 'staff_queue' && isStaff) {
    conditions.push(eq(claims.staffId, session.user.id));
  }

  if (statusFilter && (VALID_STATUSES as readonly string[]).includes(statusFilter)) {
    conditions.push(eq(claims.status, statusFilter as any));
  }

  if (searchQuery) {
    const searchCondition =
      scope === 'member'
        ? or(ilike(claims.title, `%${searchQuery}%`), ilike(claims.companyName, `%${searchQuery}%`))
        : or(
            ilike(claims.title, `%${searchQuery}%`),
            ilike(claims.companyName, `%${searchQuery}%`),
            ilike(user.name, `%${searchQuery}%`),
            ilike(user.email, `%${searchQuery}%`)
          );

    if (searchCondition) {
      conditions.push(searchCondition);
    }
  }

  const whereClause = conditions.length ? and(...conditions) : undefined;

  const [countRow] = await db
    .select({ total: count() })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(whereClause);

  const totalCount = Number(countRow?.total || 0);
  const totalPages = Math.max(1, Math.ceil(totalCount / perPage));
  const offset = (page - 1) * perPage;

  const rows = await db
    .select({
      id: claims.id,
      title: claims.title,
      status: claims.status,
      createdAt: claims.createdAt,
      companyName: claims.companyName,
      claimAmount: claims.claimAmount,
      currency: claims.currency,
      category: claims.category,
      claimantName: user.name,
      claimantEmail: user.email,
    })
    .from(claims)
    .leftJoin(user, eq(claims.userId, user.id))
    .where(whereClause)
    .orderBy(desc(claims.createdAt))
    .limit(perPage)
    .offset(offset);

  const unreadCounts = new Map<string, number>();

  if (scope !== 'member' && rows.length > 0) {
    const unreadRows = await db
      .select({
        claimId: claimMessages.claimId,
        total: count(),
      })
      .from(claimMessages)
      .innerJoin(claims, eq(claimMessages.claimId, claims.id))
      .where(
        and(
          inArray(claimMessages.claimId, rows.map(row => row.id)),
          isNull(claimMessages.readAt),
          eq(claimMessages.senderId, claims.userId)
        )
      )
      .groupBy(claimMessages.claimId);

    for (const row of unreadRows) {
      unreadCounts.set(row.claimId, Number(row.total || 0));
    }
  }

  return NextResponse.json({
    success: true,
    claims: rows.map(row => ({
      id: row.id,
      title: row.title,
      status: row.status,
      createdAt: row.createdAt ? row.createdAt.toISOString() : null,
      companyName: row.companyName,
      claimAmount: row.claimAmount,
      currency: row.currency,
      category: row.category,
      claimantName: row.claimantName,
      claimantEmail: row.claimantEmail,
      unreadCount: scope === 'member' ? 0 : unreadCounts.get(row.id) || 0,
    })),
    page,
    perPage,
    totalCount,
    totalPages,
  });
}
