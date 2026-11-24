// The verification tables keep their migration ACLs when the local E2E role is provisioned later.
const verificationGrants = new Map([
  ['public.exchange_rate_verifications', 'SELECT, INSERT'],
  ['public.exchange_rate_verification_limits', 'SELECT'],
  ['public.exchange_rate_check_windows', 'SELECT'],
  ['public.exchange_rate_check_events', 'SELECT, INSERT'],
]);

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
}
