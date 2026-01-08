import { eq, ilike, inArray, or, user } from '@interdomestik/database';
import { type scopeFilter } from '@interdomestik/shared-auth';
import { isNotNull, isNull, type SQL } from 'drizzle-orm';

export type GetUsersFilters = {
  search?: string;
  role?: string;
  assignment?: string;
};

export function buildScopeConditions(scope: ReturnType<typeof scopeFilter>): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];
  if (!scope.isFullTenantScope) {
    if (scope.branchId) {
      conditions.push(eq(user.branchId, scope.branchId));
    }
    if (scope.agentId) {
      conditions.push(eq(user.agentId, scope.agentId));
    }
  }
  return conditions;
}

export function buildFilterConditions(filters?: GetUsersFilters): SQL<unknown>[] {
  const conditions: SQL<unknown>[] = [];
  const roleFilter = filters?.role && filters.role !== 'all' ? filters.role : null;
  const assignmentFilter =
    filters?.assignment && filters.assignment !== 'all' ? filters.assignment : null;

  if (roleFilter) {
    conditions.push(
      roleFilter.includes(',')
        ? inArray(user.role, roleFilter.split(','))
        : eq(user.role, roleFilter)
    );
  }

  if (assignmentFilter === 'assigned') {
    conditions.push(isNotNull(user.agentId));
  } else if (assignmentFilter === 'unassigned') {
    conditions.push(isNull(user.agentId));
  }

  if (filters?.search) {
    const term = `%${filters.search}%`;
    conditions.push(or(ilike(user.name, term), ilike(user.email, term))!);
  }
  return conditions;
}

export function buildUserConditions(
  scope: ReturnType<typeof scopeFilter>,
  filters?: GetUsersFilters
) {
  return [...buildScopeConditions(scope), ...buildFilterConditions(filters)];
}
