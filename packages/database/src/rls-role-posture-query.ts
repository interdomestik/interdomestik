import type postgres from 'postgres';

import type { RlsConnectionRolePosture } from './rls-role-assertion';

/**
 * SQLSTATE raised by the posture query when PostgreSQL itself refuses the role.
 * The refusal happens before any row is decoded, so a replaced or corrupted
 * driver boolean parser cannot turn a privileged role into a passing posture.
 */
export const RLS_ROLE_POSTURE_REJECTED_SQLSTATE = '22012';

/**
 * Refuses in PostgreSQL unless the checked role, authenticated session_user
 * and effective current_user are all NOBYPASSRLS and NOSUPERUSER. The refusal
 * happens before driver decoding. Production and pilot runtime connections
 * require a genuinely restricted login; demoting a privileged login with
 * `-c role=` does not satisfy that boundary. Role flags alone do not prove
 * membership, ownership or callable-function confinement.
 * Catalog relations and operators are schema-qualified so search_path cannot
 * substitute either.
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
          select 1 from pg_catalog.pg_roles as login_role
          where login_role.rolname OPERATOR(pg_catalog.=) session_user
            and not login_role.rolbypassrls
            and not login_role.rolsuper
        )
        and exists (
          select 1 from pg_catalog.pg_roles as effective_role
          where effective_role.rolname OPERATOR(pg_catalog.=) current_user
            and not effective_role.rolbypassrls
            and not effective_role.rolsuper
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
          select 1 from pg_catalog.pg_roles as login_role
          where login_role.rolname OPERATOR(pg_catalog.=) session_user
            and not login_role.rolbypassrls
            and not login_role.rolsuper
        )
        and exists (
          select 1 from pg_catalog.pg_roles as effective_role
          where effective_role.rolname OPERATOR(pg_catalog.=) current_user
            and not effective_role.rolbypassrls
            and not effective_role.rolsuper
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
