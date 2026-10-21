import type postgres from 'postgres';

import type { RlsConnectionRolePosture } from './rls-role-assertion';

/**
 * SQLSTATE raised by the posture query when PostgreSQL itself refuses the role.
 * The refusal happens before any row is decoded, so a replaced or corrupted
 * driver boolean parser cannot turn a privileged role into a passing posture.
 */
export const RLS_ROLE_POSTURE_REJECTED_SQLSTATE = '22012';

/**
 * Reads the RLS role posture with a server-enforced refusal: unless both the
 * checked role and the session's login role are NOBYPASSRLS and NOSUPERUSER,
 * the row expression divides by zero and the query fails. Catalog relations and
 * operators are schema-qualified so search_path cannot substitute either.
 */
export async function queryRlsRolePosture(
  client: postgres.Sql,
  roleName?: string
): Promise<RlsConnectionRolePosture[]> {
  // Complete statements, not composed fragments: one tagged-template call per check.
  if (roleName) {
    return client<RlsConnectionRolePosture[]>`
    select
      current_user as "currentUser",
      checked_role.rolname as "roleName",
      checked_role.rolbypassrls as "roleBypassesRls",
      checked_role.rolsuper as "roleIsSuperuser",
      1 OPERATOR(pg_catalog./) CASE WHEN
        not checked_role.rolbypassrls
        and not checked_role.rolsuper
        and exists (
          select 1 from pg_catalog.pg_roles as connection_role
          where connection_role.rolname OPERATOR(pg_catalog.=) session_user
            and not connection_role.rolbypassrls
            and not connection_role.rolsuper
        )
      THEN 1 ELSE 0 END as "serverEnforcedNoBypass"
    from pg_catalog.pg_roles as checked_role
    where checked_role.rolname OPERATOR(pg_catalog.=) CAST(${roleName} AS pg_catalog.name)
    limit 1
  `;
  }

  return client<RlsConnectionRolePosture[]>`
    select
      current_user as "currentUser",
      checked_role.rolname as "roleName",
      checked_role.rolbypassrls as "roleBypassesRls",
      checked_role.rolsuper as "roleIsSuperuser",
      1 OPERATOR(pg_catalog./) CASE WHEN
        not checked_role.rolbypassrls
        and not checked_role.rolsuper
        and exists (
          select 1 from pg_catalog.pg_roles as connection_role
          where connection_role.rolname OPERATOR(pg_catalog.=) session_user
            and not connection_role.rolbypassrls
            and not connection_role.rolsuper
        )
      THEN 1 ELSE 0 END as "serverEnforcedNoBypass"
    from pg_catalog.pg_roles as checked_role
    where checked_role.rolname OPERATOR(pg_catalog.=) current_user
    limit 1
  `;
}

export function isRlsRolePostureRejectedByServer(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    (error as { code?: unknown }).code === RLS_ROLE_POSTURE_REJECTED_SQLSTATE
  );
}
