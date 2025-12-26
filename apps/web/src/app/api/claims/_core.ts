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
import { CLAIM_STATUSES } from '@interdomestik/database/constants';
import { SQL, count, desc, isNotNull, isNull, ne } from 'drizzle-orm';

type Session = {
  user: {
    id: string;
    role?: string | null;
  };
};

const VALID_STATUSES = CLAIM_STATUSES;
const MAX_PER_PAGE = 50;

type ClaimsScope =
  | 'member'
  | 'admin'
  | 'staff_queue'
  | 'staff_all'
  | 'staff_unassigned'
  | 'agent_queue';

type ClaimsListResponse = {
  success: boolean;
  claims?: Array<{
    id: string;
    title: string | null;
    status: string | null;
    createdAt: string | null;
    companyName: string | null;
    claimAmount: string | null;
    currency: string | null;
    category: string | null;
    claimantName?: string | null;
    claimantEmail?: string | null;
    unreadCount?: number;
  }>;
  page?: number;
  perPage?: number;
  totalCount?: number;
  totalPages?: number;
  error?: string;
};

function clampPage(value: number) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

function clampPerPage(value: number, fallback: number) {
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), MAX_PER_PAGE);
}

function parseScope(scopeParam: string | null): ClaimsScope {
  const value = scopeParam || 'member';
  if (
    value === 'admin' ||
    value === 'staff_queue' ||
    value === 'staff_all' ||
    value === 'staff_unassigned' ||
    value === 'agent_queue'
  ) {
    return value;
  }
  return 'member';
}

export async function listClaimsCore(args: {
  session: Session;
  url: URL;
}): Promise<{ status: 200 | 403; body: ClaimsListResponse }> {
  const { session, url } = args;

  const scope = parseScope(url.searchParams.get('scope'));
  const statusFilter = url.searchParams.get('status') || undefined;
  const searchQuery = url.searchParams.get('search') || undefined;
  const page = clampPage(Number(url.searchParams.get('page') || 1));
  const perPage = clampPerPage(Number(url.searchParams.get('perPage') || 10), 10);

  const role = session.user.role || 'user';
  const isAdmin = role === 'admin';
  const isStaff = role === 'staff';
  const isAgent = role === 'agent';

  if (scope === 'admin' && !isAdmin) {
    return { status: 403, body: { success: false, error: 'Unauthorized' } };
  }

  if (
    (scope === 'staff_queue' || scope === 'staff_all' || scope === 'staff_unassigned') &&
    !isAdmin &&
    !isStaff
  ) {
    return { status: 403, body: { success: false, error: 'Unauthorized' } };
  }

  if (scope === 'agent_queue' && !isAgent && !isAdmin) {
    return { status: 403, body: { success: false, error: 'Unauthorized' } };
  }

  const conditions: SQL<unknown>[] = [];

  if (scope === 'member') {
    conditions.push(eq(claims.userId, session.user.id));
  }

  if (scope === 'staff_queue' && isStaff) {
    conditions.push(eq(claims.staffId, session.user.id));
  }

  if (scope === 'staff_queue' && isAdmin && !isStaff) {
    conditions.push(isNotNull(claims.staffId));
  }

  if (scope === 'staff_unassigned') {
    conditions.push(isNull(claims.staffId));
    conditions.push(ne(claims.status, 'draft'));
  }

  if (scope === 'agent_queue') {
    if (isAgent) {
      // Agents only see claims from users they manage
      conditions.push(eq(user.agentId, session.user.id));
    }
    if (isAdmin && !isAgent) {
      conditions.push(isNotNull(user.agentId));
    }
  }

  if (statusFilter && (VALID_STATUSES as readonly string[]).includes(statusFilter)) {
    conditions.push(eq(claims.status, statusFilter as (typeof VALID_STATUSES)[number]));
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
          inArray(
            claimMessages.claimId,
            rows.map(row => row.id)
          ),
          isNull(claimMessages.readAt),
          eq(claimMessages.senderId, claims.userId)
        )
      )
      .groupBy(claimMessages.claimId);

    for (const row of unreadRows) {
      unreadCounts.set(row.claimId, Number(row.total || 0));
    }
  }

  const redactForAgent = scope === 'agent_queue' && isAgent;

  return {
    status: 200,
    body: {
      success: true,
      claims: rows.map(row => ({
        id: row.id,
        title: redactForAgent ? null : row.title,
        status: row.status,
        createdAt: row.createdAt ? row.createdAt.toISOString() : null,
        companyName: redactForAgent ? null : row.companyName,
        claimAmount: redactForAgent ? null : row.claimAmount,
        currency: redactForAgent ? null : row.currency,
        category: redactForAgent ? null : row.category,
        claimantName: redactForAgent ? null : row.claimantName,
        claimantEmail: redactForAgent ? null : row.claimantEmail,
        unreadCount: scope === 'member' || redactForAgent ? 0 : unreadCounts.get(row.id) || 0,
      })),
      page,
      perPage,
      totalCount,
      totalPages,
    },
  };
}
