// U2-e staging enrolment privilege proof: what the restricted runtime role holds on the enrolled
// marker, the migration ledger and everything else in the ledger schema, read inside the enrolment
// transaction before commit. Grant options, column grants and MAINTAIN (PostgreSQL 17) included.

/** Grants other than the owner's on the marker objects; nothing but the two reads may exist. */
export async function markerAcl(tx) {
  const [acl] = await tx`
    WITH ns AS (SELECT oid, nspowner, nspacl FROM pg_catalog.pg_namespace WHERE nspname = 'runtime_attestation'),
      tbl AS (SELECT c.oid, c.relowner, c.relacl FROM pg_catalog.pg_class c, ns
        WHERE c.relnamespace = ns.oid AND c.relname = 'backend_marker')
    SELECT
      (SELECT pg_catalog.string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END
        || ':' || a.privilege_type || ':' || a.is_grantable, ',')
        FROM ns, pg_catalog.aclexplode(ns.nspacl) a WHERE a.grantee <> ns.nspowner) AS schema,
      (SELECT pg_catalog.string_agg(CASE WHEN a.grantee = 0 THEN 'PUBLIC' ELSE pg_catalog.pg_get_userbyid(a.grantee) END
        || ':' || a.privilege_type || ':' || a.is_grantable, ',')
        FROM tbl, pg_catalog.aclexplode(tbl.relacl) a WHERE a.grantee <> tbl.relowner) AS "table",
      (SELECT count(*) FROM pg_catalog.pg_attribute x, tbl WHERE x.attrelid = tbl.oid AND x.attacl IS NOT NULL)::int
        AS "columnAcls"`;
  return acl;
}

export async function privilegeMatrix(tx, role) {
  const [m] = await tx`
    WITH r AS (SELECT ${role}::pg_catalog.name AS n,
        (SELECT oid FROM pg_catalog.pg_roles WHERE rolname = ${role}) AS oid,
        pg_catalog.current_setting('server_version_num')::int >= 170000 AS maintain),
      l AS (SELECT 'drizzle.__drizzle_migrations'::pg_catalog.regclass AS oid),
      k AS (SELECT 'runtime_attestation.backend_marker'::pg_catalog.regclass AS oid)
    SELECT
      pg_catalog.has_schema_privilege(r.n, 'drizzle', 'USAGE') AS "ledgerSchemaUsage",
      pg_catalog.has_schema_privilege(r.n, 'drizzle', 'CREATE') AS "ledgerSchemaCreate",
      pg_catalog.has_schema_privilege(r.n, 'drizzle', 'USAGE WITH GRANT OPTION,CREATE WITH GRANT OPTION')
        AS "ledgerSchemaGrantOption",
      pg_catalog.has_table_privilege(r.n, l.oid, 'SELECT') AS "ledgerSelect",
      pg_catalog.has_table_privilege(r.n, l.oid, 'SELECT WITH GRANT OPTION') AS "ledgerGrantOption",
      pg_catalog.has_table_privilege(r.n, l.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS "ledgerWrite",
      CASE WHEN r.maintain THEN pg_catalog.has_table_privilege(r.n, l.oid, 'MAINTAIN') ELSE false END
        AS "ledgerMaintain",
      pg_catalog.has_any_column_privilege(r.n, l.oid, 'INSERT,UPDATE,REFERENCES') AS "ledgerColumnWrite",
      pg_catalog.has_any_column_privilege(r.n, l.oid,
        'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION')
        AS "ledgerColumnGrantOption",
      (SELECT pg_catalog.string_agg(a.privilege_type || ':' || a.is_grantable, ',' ORDER BY a.privilege_type)
        FROM pg_catalog.pg_namespace n, pg_catalog.aclexplode(n.nspacl) a
        WHERE n.nspname = 'drizzle' AND a.grantee = r.oid) AS "ledgerSchemaRoleAcl",
      (SELECT pg_catalog.string_agg(a.privilege_type || ':' || a.is_grantable, ',' ORDER BY a.privilege_type)
        FROM pg_catalog.pg_class c, pg_catalog.aclexplode(c.relacl) a
        WHERE c.oid = l.oid AND a.grantee = r.oid) AS "ledgerRoleAcl",
      (SELECT count(*) FROM pg_catalog.pg_attribute x, pg_catalog.aclexplode(x.attacl) a
        WHERE x.attrelid = l.oid AND a.grantee IN (r.oid, 0))::int AS "ledgerColumnAcls",
      pg_catalog.has_schema_privilege(r.n, 'runtime_attestation', 'USAGE') AS "markerSchemaUsage",
      pg_catalog.has_schema_privilege(r.n, 'runtime_attestation', 'CREATE') AS "markerSchemaCreate",
      pg_catalog.has_schema_privilege(r.n, 'runtime_attestation',
        'USAGE WITH GRANT OPTION,CREATE WITH GRANT OPTION') AS "markerSchemaGrantOption",
      pg_catalog.has_table_privilege(r.n, k.oid, 'SELECT') AS "markerSelect",
      pg_catalog.has_table_privilege(r.n, k.oid, 'SELECT WITH GRANT OPTION') AS "markerGrantOption",
      pg_catalog.has_table_privilege(r.n, k.oid, 'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') AS "markerWrite",
      CASE WHEN r.maintain THEN pg_catalog.has_table_privilege(r.n, k.oid, 'MAINTAIN') ELSE false END
        AS "markerMaintain",
      pg_catalog.has_any_column_privilege(r.n, k.oid, 'INSERT,UPDATE,REFERENCES') AS "markerColumnWrite",
      pg_catalog.has_any_column_privilege(r.n, k.oid,
        'SELECT WITH GRANT OPTION,INSERT WITH GRANT OPTION,UPDATE WITH GRANT OPTION,REFERENCES WITH GRANT OPTION')
        AS "markerColumnGrantOption",
      (SELECT count(*) FROM pg_catalog.pg_class c WHERE c.relnamespace = 'drizzle'::pg_catalog.regnamespace
        AND CASE WHEN c.relkind = 'S' THEN pg_catalog.has_sequence_privilege(r.n, c.oid, 'USAGE,SELECT,UPDATE')
          ELSE false END)::int
        AS "sequenceAccess",
      (SELECT count(*) FROM pg_catalog.pg_class c WHERE c.relnamespace = 'drizzle'::pg_catalog.regnamespace
        AND c.oid <> l.oid
        AND CASE WHEN c.relkind IN ('r', 'v', 'm', 'f', 'p')
          THEN pg_catalog.has_table_privilege(r.n, c.oid, 'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER')
            OR pg_catalog.has_any_column_privilege(r.n, c.oid, 'SELECT,INSERT,UPDATE,REFERENCES')
            OR (r.maintain AND pg_catalog.has_table_privilege(r.n, c.oid, 'MAINTAIN'))
          ELSE false END)::int
        AS "otherRelationAccess",
      (SELECT count(*) FROM pg_catalog.pg_proc p WHERE p.pronamespace = 'drizzle'::pg_catalog.regnamespace
        AND pg_catalog.has_function_privilege(r.n, p.oid, 'EXECUTE'))::int AS "functionAccess"
    FROM r, l, k`;
  return m;
}

/** The only privileges the runtime role may hold on the enrolled objects and the ledger schema. */
export const EXPECTED_MATRIX = Object.freeze({
  ledgerSchemaUsage: true,
  ledgerSchemaCreate: false,
  ledgerSchemaGrantOption: false,
  ledgerSelect: true,
  ledgerGrantOption: false,
  ledgerWrite: false,
  ledgerMaintain: false,
  ledgerColumnWrite: false,
  ledgerColumnGrantOption: false,
  ledgerSchemaRoleAcl: 'USAGE:false',
  ledgerRoleAcl: 'SELECT:false',
  ledgerColumnAcls: 0,
  markerSchemaUsage: true,
  markerSchemaCreate: false,
  markerSchemaGrantOption: false,
  markerSelect: true,
  markerGrantOption: false,
  markerWrite: false,
  markerMaintain: false,
  markerColumnWrite: false,
  markerColumnGrantOption: false,
  sequenceAccess: 0,
  otherRelationAccess: 0,
  functionAccess: 0,
});
