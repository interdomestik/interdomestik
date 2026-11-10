import { sql, type SQL } from 'drizzle-orm';

export type PilotBranchViolation = { tenant_id: string; kind: string; id: string };

// Cross-tenant corrupt references cannot be audited reliably through tenant-filtered RLS.
// This never grants privileges: the operator must supply an already authorized read-only audit role.
export function assertPilotAuditVisibility(canAudit: unknown): void {
  if (canAudit !== true) throw new Error('Audit role cannot verify complete branch coverage');
}

/** One SELECT gives a consistent snapshot. Every table is restricted to the explicit tenant ids. */
export function pilotBranchReportQuery(tenantIds: readonly string[]): SQL {
  if (!tenantIds.length || tenantIds.some(id => !/^[a-zA-Z0-9_-]+$/.test(id))) {
    throw new Error('Explicit tenant ids are required');
  }
  const ids = sql.join(
    [...new Set(tenantIds)].map(id => sql`${id}::text`),
    sql`, `
  );
  return sql`with targets as (
      select unnest(array[${ids}]) as tenant_id
    ), active_branches as (
      select b.id, b.tenant_id from branches b
      join targets t on t.tenant_id = b.tenant_id where b.is_active = true
    ), policy as (
      select t.tenant_id, count(b.id) as active_count,
        exists(select 1 from tenant_settings s where s.tenant_id = t.tenant_id
          and s.category = 'branches' and s.key = 'multi_branch'
          and s.value -> 'enabled' = 'true'::jsonb) as multi_branch
      from targets t left join active_branches b on b.tenant_id = t.tenant_id
      group by t.tenant_id
    ), records as (
      select u.tenant_id, 'user'::text as kind, u.id, u.branch_id
      from "user" u join targets t on t.tenant_id = u.tenant_id
      where u.role in ('staff', 'agent', 'branch_manager')
      union all
      select c.tenant_id, 'claim', c.id, c.branch_id
      from claim c join targets t on t.tenant_id = c.tenant_id
      union all
      select s.tenant_id, 'subscription', s.id, s.branch_id
      from subscriptions s join targets t on t.tenant_id = s.tenant_id
      union all
      select h.tenant_id, 'support_handoff', h.id, h.branch_id
      from support_handoffs h join targets t on t.tenant_id = h.tenant_id
    )
    select p.tenant_id, 'active_branch_count'::text as kind, p.tenant_id as id
      from policy p where not p.multi_branch and p.active_count <> 1
    union all
    select r.tenant_id, r.kind, r.id from records r
      left join active_branches b on b.id = r.branch_id and b.tenant_id = r.tenant_id
      where b.id is null
    order by tenant_id, kind, id`;
}

/** Output is deliberately restricted to counts and row identifiers, never record content. */
export function formatPilotBranchReport(rows: readonly PilotBranchViolation[]): string[] {
  const groups = new Map<string, string[]>();
  for (const row of rows) {
    const key = `${row.tenant_id}/${row.kind}`;
    const ids = groups.get(key) ?? [];
    ids.push(row.id);
    groups.set(key, ids);
  }
  return [
    `violations=${rows.length}`,
    ...[...groups].map(
      ([key, ids]) =>
        `${key} count=${ids.length} ids=${ids.map(id => JSON.stringify(id)).join(',')}`
    ),
  ];
}
