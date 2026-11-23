/**
 * Tables whose migration narrows the runtime role's writes: no DELETE and UPDATE only on these
 * columns (WP-12 migration 0104). The bulk DML grant below must not widen them, so provisioning
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

export async function grantRuntimeRelations(tx, role, relations) {
  const names = kinds => relations.filter(r => kinds.includes(r.kind)).map(r => `public.${r.name}`);
  const grants = [
    ['SELECT, INSERT, UPDATE, DELETE ON TABLE', names(['r', 'p'])],
    ['USAGE, SELECT ON SEQUENCE', names(['S'])],
    ['SELECT ON TABLE', names(['v'])],
  ].filter(([, targets]) => targets.length > 0);
  await Promise.all(
    grants.map(([privileges, targets]) =>
      tx.unsafe(`GRANT ${privileges} ${targets.join(', ')} TO ${role}`)
    )
  );
  const tables = new Set(names(['r', 'p']));
  // In order on the one transaction connection: each REVOKE runs before its table's GRANT.
  const narrowed = Object.entries(NARROWED_TABLE_GRANTS)
    .filter(([table]) => tables.has(`public.${table}`))
    .flatMap(([table, columns]) => [
      `REVOKE UPDATE, DELETE, TRUNCATE ON TABLE public.${table} FROM ${role}`,
      ...(columns.length > 0
        ? [`GRANT UPDATE (${columns.join(', ')}) ON TABLE public.${table} TO ${role}`]
        : []),
    ]);
  await Promise.all(narrowed.map(statement => tx.unsafe(statement)));
}
