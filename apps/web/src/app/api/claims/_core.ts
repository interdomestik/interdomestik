import {
  listClaims,
  type ClaimsListResponse,
  type ClaimsScope,
} from '@interdomestik/domain-claims';
import type { SessionWithTenant } from '@interdomestik/shared-auth';

const MAX_PER_PAGE = 50;

function clampPage(value: number) {
  if (!Number.isFinite(value) || value < 1) return 1;
  return Math.floor(value);
}

function clampPerPage(value: number, fallback: number) {
  if (!Number.isFinite(value) || value < 1) return fallback;
  return Math.min(Math.floor(value), MAX_PER_PAGE);
}

function parseScope(scopeParam: string | null = 'member'): ClaimsScope {
  const value = scopeParam ?? 'member';
  if (
    value === 'admin' ||
    value === 'staff_queue' ||
    value === 'staff_all' ||
    value === 'staff_unassigned' ||
    value === 'agent_queue'
  ) {
    return value as ClaimsScope;
  }
  return 'member';
}

export async function listClaimsCore(args: {
  session: { user: { id: string; role?: string | null; tenantId?: string | null } };
  url: URL;
}): Promise<{ status: 200 | 403; body: ClaimsListResponse }> {
  try {
    const { session, url } = args;

    const scope = parseScope(url.searchParams.get('scope'));
    const status = url.searchParams.get('status') || undefined;
    const search = url.searchParams.get('search') || undefined;
    const page = clampPage(Number(url.searchParams.get('page') || 1));
    const perPage = clampPerPage(Number(url.searchParams.get('perPage') || 10), 10);

    const result = await listClaims({
      session: session as unknown as SessionWithTenant,
      scope,
      status,
      search,
      page,
      perPage,
    });

    if (!result.success && result.error === 'Unauthorized') {
      return { status: 403, body: result };
    }

    return { status: 200, body: result };
  } catch (error) {
    console.error('listClaimsCore error:', error);
    return {
      status: 200,
      body: {
        success: false,
        error: error instanceof Error ? error.message : 'Internal Server Error',
      },
    };
  }
}
