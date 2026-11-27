// Migrations that narrow the runtime role's grants keep them when the local E2E role is
// provisioned later: the bulk DML grant below skips or re-narrows these tables.

// WP-07 PR-1c: the verification tables carry table-level privileges only.
const verificationGrants = new Map([
  ['public.exchange_rate_verifications', 'SELECT, INSERT'],
  ['public.exchange_rate_verification_limits', 'SELECT'],
  ['public.exchange_rate_check_windows', 'SELECT'],
  ['public.exchange_rate_check_events', 'SELECT, INSERT'],
]);

/**
 * Tables whose migration narrows the runtime role's writes: no DELETE and UPDATE only on these
 * columns (WP-12 migration 0106). The bulk DML grant must not widen them, so provisioning
 * re-applies the migration's grants. A test pins this list to the migration's own GRANT lines.
 */
export const NARROWED_TABLE_GRANTS = Object.freeze({
  claim_authorities: ['revoked_at', 'revoked_by_user_id'],
  claim_correspondence: ['follow_up_at'],
  claim_correspondence_documents: [],
  claim_case_fields: [
    'other_vehicle_country_code',
    'insurance_proof_reference',
    'outside_handling_party',
    'coverage_verification_status',
    'case_follow_up_at',
    'updated_by_staff_id',
    'updated_at',
  ],
});

export async function grantE2eRuntimePrivileges(tx, role) {
  // Base tables get DML under RLS. Views are readable only with invoker rights.
  const relations = await tx`
    select quote_ident(c.relname) as name, c.relkind as kind
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public' and (c.relkind in ('r', 'p', 'S')
      or (c.relkind = 'v' and 'security_invoker=true' = any(coalesce(c.reloptions, '{}'))))
    order by c.relname`;
  const names = kinds => relations.filter(r => kinds.includes(r.kind)).map(r => `public.${r.name}`);
  const tables = names(['r', 'p']);
  const grants = [
    [
      'SELECT, INSERT, UPDATE, DELETE ON TABLE',
      tables.filter(name => !verificationGrants.has(name)),
    ],
    ['USAGE, SELECT ON SEQUENCE', names(['S'])],
    ['SELECT ON TABLE', names(['v'])],
  ].filter(([, targets]) => targets.length > 0);
  await Promise.all(
    grants.map(([privileges, targets]) =>
      tx.unsafe(`GRANT ${privileges} ${targets.join(', ')} TO ${role}`)
    )
  );

  const existing = [...verificationGrants].filter(([table]) => tables.includes(table));
  await Promise.all(
    existing.map(async ([table, privileges]) => {
      await tx.unsafe(`REVOKE ALL ON TABLE ${table} FROM ${role}`);
      await tx.unsafe(`GRANT ${privileges} ON TABLE ${table} TO ${role}`);
    })
  );

  // In order on the one transaction connection: each REVOKE runs before its table's GRANT.
  const narrowed = Object.entries(NARROWED_TABLE_GRANTS)
    .filter(([table]) => tables.includes(`public.${table}`))
    .flatMap(([table, columns]) => [
      `REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.${table} FROM ${role}`,
      ...(columns.length > 0
        ? [`GRANT UPDATE (${columns.join(', ')}) ON TABLE public.${table} TO ${role}`]
        : []),
    ]);
  await Promise.all(narrowed.map(statement => tx.unsafe(statement)));
}
