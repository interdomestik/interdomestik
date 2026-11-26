import type { MigrationExecutionSql } from './migration-execution-contracts';

export const sponsorRuntimeRole = 'interdomestik_runtime_rls';
export const sponsorCheckpointTag = '0104_wp07_rate_verification_age';
export const sponsorCheckpointGrants = [
  ['claim', 'updatedAt'],
  ['user', 'updatedAt'],
  ['claim_escalation_agreements', 'updated_at'],
  ['subscriptions', 'dunning_attempt_count'],
  ['membership_plans', 'id'],
  ['sponsor_terms', 'terminated_at'],
  ['sponsor_roster_entries', 'outcome'],
  ['claim_recovery_no_fee_evidence', 'updated_at'],
  ['claim_transition_evidence', 'id'],
  ['claim_messages', 'read_at'],
] as const;
export type ReleaseSql = MigrationExecutionSql;

export type DirectUpdateGrant = {
  relation: string;
  column: string;
  grantor: string;
  grantable: boolean;
};
export type CheckpointCheck = {
  relation: string;
  column: string;
  namedEffective: boolean;
  matches0105: boolean;
  unexpectedEffective: boolean;
  direct: DirectUpdateGrant[];
};

export async function inspectSponsorCheckpoint(sql: ReleaseSql): Promise<CheckpointCheck[]> {
  const relations = sponsorCheckpointGrants.map(([table]) => table);
  const columns = sponsorCheckpointGrants.map(([, column]) => column);
  return sql<CheckpointCheck[]>`
    select c.relname as relation, expected.column_name as column,
      has_column_privilege(r.oid, c.oid, expected.column_name, 'UPDATE') as "namedEffective",
      (has_table_privilege(r.oid, c.oid, 'UPDATE')
        or has_any_column_privilege(r.oid, c.oid, 'UPDATE')) as "matches0105",
      (has_table_privilege(r.oid, c.oid, 'UPDATE')
        or has_column_privilege(r.oid, c.oid, expected.column_name, 'UPDATE WITH GRANT OPTION')
        or exists (
          select from pg_attribute a
          where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
            and a.attname <> expected.column_name
            and has_column_privilege(r.oid, c.oid, a.attnum, 'UPDATE')
        )) as "unexpectedEffective",
      coalesce((
        select jsonb_agg(jsonb_build_object(
          'relation', c.relname, 'column', a.attname, 'grantor', g.rolname,
          'grantable', acl.is_grantable
        ) order by a.attnum, g.rolname)
        from pg_attribute a
        cross join lateral aclexplode(a.attacl) acl
        join pg_roles g on g.oid = acl.grantor
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped
          and acl.grantee = r.oid and acl.privilege_type = 'UPDATE'
      ), '[]'::jsonb) as direct
    from unnest(${relations}::text[], ${columns}::text[]) with ordinality
      as expected(relation, column_name, position)
    join pg_class c on c.oid = to_regclass(format('public.%I', expected.relation))
    join pg_roles r on r.rolname = ${sponsorRuntimeRole}
    order by expected.position
  `;
}

export function verifySponsorCheckpoint(checks: CheckpointCheck[], owner: string): void {
  const issues = sponsorCheckpointGrants.flatMap(([relation, column], index) => {
    const row = checks[index];
    if (!row || row.relation !== relation || row.column !== column)
      return [`public.${relation}.${column}: catalog row missing`];
    const issues = [];
    if (!row.namedEffective) issues.push('missing named effective UPDATE');
    if (!row.matches0105) issues.push('missing effective UPDATE for 0105');
    if (row.unexpectedEffective) issues.push('unexpected effective UPDATE or grant option');
    const [direct] = row.direct;
    if (
      row.direct.length !== 1 ||
      direct?.column !== column ||
      direct.grantor !== owner ||
      direct.grantable
    ) {
      issues.push(
        'expected exactly one direct column UPDATE from the release owner without grant option'
      );
    }
    return issues.map(issue => `public.${relation}.${column}: ${issue}`);
  });
  if (issues.length) throw new Error(`0105 prerequisites rejected:\n${issues.join('\n')}`);
}
