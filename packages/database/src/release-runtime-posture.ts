import { sponsorRuntimeRole, type ReleaseSql } from './release-sponsor-checkpoint';

export async function inspectReleaseRuntime(sql: ReleaseSql) {
  const [posture] = await sql<
    {
      owner: string;
      version: number;
      ownsDatabase: boolean;
      targetIdle: boolean;
      runtimeSafe: boolean;
      runtimeOwnsObjects: boolean;
      runtimeInherits: boolean;
      otherRolesInheritRuntime: boolean;
      databaseConnect: boolean;
      databaseCreate: boolean;
      schemaUsage: boolean;
      schemaCreate: boolean;
      publicDatabaseAcl: string[];
      publicSchemaAcl: string[];
      creatorDefaults: { schema: string | null; kind: string; acl: string }[];
    }[]
  >`
    select current_user as owner, current_setting('server_version_num')::int as version,
      d.datdba = current_user::regrole as "ownsDatabase",
      not exists (
        select from pg_stat_activity s where s.datid = d.oid
          and s.backend_type = 'client backend' and s.pid <> pg_backend_pid()
      ) as "targetIdle",
      not (r.rolsuper or r.rolbypassrls or r.rolcreaterole or r.rolcreatedb or r.rolreplication)
        as "runtimeSafe",
      exists (
        select from pg_shdepend dep where dep.refclassid = 'pg_authid'::regclass
          and dep.refobjid = r.oid and dep.deptype = 'o' and dep.dbid in (0, d.oid)
      ) as "runtimeOwnsObjects",
      exists (select from pg_auth_members where member = r.oid) as "runtimeInherits",
      exists (select from pg_auth_members where roleid = r.oid and inherit_option)
        as "otherRolesInheritRuntime",
      has_database_privilege(r.oid, d.oid, 'CONNECT') as "databaseConnect",
      has_database_privilege(r.oid, d.oid, 'CREATE') as "databaseCreate",
      has_schema_privilege(r.oid, n.oid, 'USAGE') as "schemaUsage",
      has_schema_privilege(r.oid, n.oid, 'CREATE') as "schemaCreate",
      array(select privilege_type from aclexplode(coalesce(d.datacl, acldefault('d', d.datdba)))
        where grantee = 0 order by privilege_type) as "publicDatabaseAcl",
      array(select privilege_type from aclexplode(coalesce(n.nspacl, acldefault('n', n.nspowner)))
        where grantee = 0 order by privilege_type) as "publicSchemaAcl",
      coalesce((
        select jsonb_agg(jsonb_build_object('schema', s.nspname, 'kind', a.defaclobjtype,
          'acl', a.defaclacl::text) order by a.defaclnamespace, a.defaclobjtype)
        from pg_default_acl a left join pg_namespace s on s.oid = a.defaclnamespace
        where a.defaclrole = current_user::regrole and (a.defaclnamespace = 0 or s.nspname = 'public')
      ), '[]'::jsonb) as "creatorDefaults"
    from pg_roles r cross join pg_database d cross join pg_namespace n
    where r.rolname = ${sponsorRuntimeRole} and d.datname = current_database() and n.nspname = 'public'
  `;
  if (
    !posture ||
    posture.version < 160000 ||
    posture.version >= 170000 ||
    !posture.ownsDatabase ||
    !posture.targetIdle ||
    !posture.runtimeSafe ||
    posture.runtimeOwnsObjects ||
    posture.runtimeInherits ||
    posture.otherRolesInheritRuntime ||
    !posture.databaseConnect ||
    posture.databaseCreate ||
    !posture.schemaUsage ||
    posture.schemaCreate
  ) {
    throw new Error(
      'Release runtime posture rejected. A closed PG16 target, release owner and isolated runtime role are required.'
    );
  }
  return posture;
}
