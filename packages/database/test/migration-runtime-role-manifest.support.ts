import postgres from 'postgres';

// prettier-ignore
type SafeRole = Readonly<Record<'login' | 'superuser' | 'bypassrls' | 'replication' | 'createdb' | 'createrole', boolean>>;
type ObjectClass = 'database' | 'schema' | 'relation' | 'sequence' | 'function' | 'type';
// prettier-ignore
type Privilege = 'public_database_connect'|'public_database_create'|'public_database_temp'|'runtime_database_connect'|'runtime_database_create'|'runtime_database_temp'|'public_schema_usage'|'runtime_schema_usage'|'public_relation_select'|'runtime_relation_select'|'runtime_relation_dml'|'public_sequence_usage'|'public_sequence_select'|'public_sequence_update'|'runtime_sequence_usage'|'runtime_sequence_select'|'runtime_sequence_update'|'public_function_execute'|'runtime_function_execute'|'public_type_usage'|'runtime_type_usage';
export type RuntimeRolePrivileges = Readonly<Record<Privilege, boolean>>;
// prettier-ignore
export interface MigrationRuntimeRoleManifest { contract_version:'migration_runtime_role_manifest_v1'; server_major:16; migration_owner_safe:boolean; runtime_role_safe:boolean; owner_classes:Readonly<Record<ObjectClass,boolean>>; runtime_membership_paths:number; runtime_owned_objects:number; privileges:RuntimeRolePrivileges; public_create_on_public:boolean; runtime_create_on_public:boolean; default_acl_rows:number; default_acl_engine_defaults:boolean; redacted:true }
// prettier-ignore
type PostureRow = Record<Privilege,boolean>&{ server_major:number; owner:SafeRole; runtime:SafeRole; owner_classes:Record<ObjectClass,boolean>; membership_paths:number; runtime_owned:number; public_create:boolean; runtime_create:boolean; default_acls:number; pid:number };
// prettier-ignore
const safe=(role:SafeRole)=>role.login&&!role.superuser&&!role.bypassrls&&!role.replication&&!role.createdb&&!role.createrole;
// prettier-ignore
const PRIVILEGES:readonly Privilege[]=Object.freeze(['public_database_connect','public_database_create','public_database_temp','runtime_database_connect','runtime_database_create','runtime_database_temp','public_schema_usage','runtime_schema_usage','public_relation_select','runtime_relation_select','runtime_relation_dml','public_sequence_usage','public_sequence_select','public_sequence_update','runtime_sequence_usage','runtime_sequence_select','runtime_sequence_update','public_function_execute','runtime_function_execute','public_type_usage','runtime_type_usage']);
// prettier-ignore
export async function inspectRuntimeRoleManifest(url:string,owner:string,runtime:string,signal:AbortSignal) {
  if (signal.aborted) throw new Error('MIGRATION_RUNTIME_ROLE_ABORTED');
  // prettier-ignore
  const sql=postgres(url,{max:1,connect_timeout:5,onnotice:()=>{},connection:{application_name:'interdomestik_p0a2a_manifest_v1'}});
  try {
    const rows = await sql<PostureRow[]>`
      WITH RECURSIVE membership(roleid) AS (
        SELECT roleid FROM pg_auth_members WHERE member = (SELECT oid FROM pg_roles WHERE rolname = ${runtime})
        UNION SELECT m.roleid FROM pg_auth_members m JOIN membership p ON m.member = p.roleid
      ), roles AS (
        SELECT rolname, jsonb_build_object('login', rolcanlogin, 'superuser', rolsuper,
          'bypassrls', rolbypassrls, 'replication', rolreplication, 'createdb', rolcreatedb,
          'createrole', rolcreaterole) AS posture FROM pg_roles WHERE rolname IN (${owner}, ${runtime})
      ), classes(kind) AS (VALUES ('database'),('schema'),('relation'),('sequence'),('function'),('type')),
      owned(kind, oid) AS (
        SELECT 'database', datdba FROM pg_database WHERE datname = current_database()
        UNION ALL SELECT 'schema', nspowner FROM pg_namespace WHERE nspname IN ('public','drizzle')
        UNION ALL SELECT 'relation', relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND relkind IN ('r','p','v','m')
        UNION ALL SELECT 'sequence', relowner FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND relkind='S'
        UNION ALL SELECT 'function', proowner FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','drizzle')
        UNION ALL SELECT 'type', typowner FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','drizzle')
      ), posture AS (
        SELECT jsonb_object_agg(c.kind, COALESCE(x.safe,true)) AS owner_classes,
          COALESCE(sum(x.runtime_owned),0)::int AS runtime_owned FROM classes c LEFT JOIN (
          SELECT kind, bool_and(oid=(SELECT oid FROM pg_roles WHERE rolname=${owner})) AS safe,
            count(*) FILTER (WHERE oid=(SELECT oid FROM pg_roles WHERE rolname=${runtime})) AS runtime_owned
          FROM owned GROUP BY kind) x ON x.kind=c.kind
      ), db_acl AS (
        SELECT COALESCE(bool_or(privilege_type='CONNECT') FILTER (WHERE grantee=0),false) AS connect,
          COALESCE(bool_or(privilege_type='CREATE') FILTER (WHERE grantee=0),false) AS create,
          COALESCE(bool_or(privilege_type='TEMPORARY') FILTER (WHERE grantee=0),false) AS temp
        FROM pg_database d, LATERAL aclexplode(COALESCE(d.datacl,acldefault('d',d.datdba))) WHERE d.datname=current_database()
      ), schema_acl AS (
        SELECT COALESCE(bool_or(privilege_type='USAGE') FILTER (WHERE grantee=0),false) AS usage,
          COALESCE(bool_or(privilege_type='CREATE') FILTER (WHERE grantee=0),false) AS create
        FROM pg_namespace n, LATERAL aclexplode(COALESCE(n.nspacl,acldefault('n',n.nspowner))) WHERE n.nspname='public'
      )
      SELECT current_setting('server_version_num')::int/10000 AS server_major,
        (SELECT posture FROM roles WHERE rolname=${owner}) AS owner, (SELECT posture FROM roles WHERE rolname=${runtime}) AS runtime,
        (SELECT owner_classes FROM posture) AS owner_classes, (SELECT runtime_owned FROM posture) AS runtime_owned,
        (SELECT count(*)::int FROM membership) AS membership_paths, db_acl.connect AS public_database_connect,
        db_acl.create AS public_database_create, db_acl.temp AS public_database_temp,
        has_database_privilege(${runtime},current_database(),'CONNECT') AS runtime_database_connect,
        has_database_privilege(${runtime},current_database(),'CREATE') AS runtime_database_create,
        has_database_privilege(${runtime},current_database(),'TEMP') AS runtime_database_temp,
        schema_acl.usage AS public_schema_usage, has_schema_privilege(${runtime},'public','USAGE') AS runtime_schema_usage,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, LATERAL aclexplode(COALESCE(c.relacl,acldefault('r',c.relowner))) a WHERE n.nspname IN ('public','drizzle') AND c.relkind IN ('r','p','v','m') AND a.grantee=0 AND a.privilege_type='SELECT') AS public_relation_select,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND CASE WHEN c.relkind IN ('r','p','v','m') THEN has_table_privilege(${runtime},c.oid,'SELECT') ELSE false END) AS runtime_relation_select,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND CASE WHEN c.relkind IN ('r','p','v','m') THEN has_table_privilege(${runtime},c.oid,'INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER') OR has_any_column_privilege(${runtime},c.oid,'INSERT,UPDATE,REFERENCES') ELSE false END) AS runtime_relation_dml,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, LATERAL aclexplode(COALESCE(c.relacl,acldefault('s',c.relowner))) a WHERE n.nspname IN ('public','drizzle') AND c.relkind='S' AND a.grantee=0 AND a.privilege_type='USAGE') AS public_sequence_usage,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, LATERAL aclexplode(COALESCE(c.relacl,acldefault('s',c.relowner))) a WHERE n.nspname IN ('public','drizzle') AND c.relkind='S' AND a.grantee=0 AND a.privilege_type='SELECT') AS public_sequence_select,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace, LATERAL aclexplode(COALESCE(c.relacl,acldefault('s',c.relowner))) a WHERE n.nspname IN ('public','drizzle') AND c.relkind='S' AND a.grantee=0 AND a.privilege_type='UPDATE') AS public_sequence_update,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(${runtime},c.oid,'USAGE') ELSE false END) AS runtime_sequence_usage,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(${runtime},c.oid,'SELECT') ELSE false END) AS runtime_sequence_select,
        EXISTS(SELECT 1 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('public','drizzle') AND CASE WHEN c.relkind='S' THEN has_sequence_privilege(${runtime},c.oid,'UPDATE') ELSE false END) AS runtime_sequence_update,
        EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace, LATERAL aclexplode(COALESCE(p.proacl,acldefault('f',p.proowner))) a WHERE n.nspname IN ('public','drizzle') AND a.grantee=0 AND a.privilege_type='EXECUTE') AS public_function_execute,
        EXISTS(SELECT 1 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname IN ('public','drizzle') AND has_function_privilege(${runtime},p.oid,'EXECUTE')) AS runtime_function_execute,
        EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace, LATERAL aclexplode(COALESCE(t.typacl,acldefault('T',t.typowner))) a WHERE n.nspname IN ('public','drizzle') AND a.grantee=0 AND a.privilege_type='USAGE') AS public_type_usage,
        EXISTS(SELECT 1 FROM pg_type t JOIN pg_namespace n ON n.oid=t.typnamespace WHERE n.nspname IN ('public','drizzle') AND has_type_privilege(${runtime},t.oid,'USAGE')) AS runtime_type_usage,
        schema_acl.create AS public_create, has_schema_privilege(${runtime},'public','CREATE') AS runtime_create,
        (SELECT count(*)::int FROM pg_default_acl WHERE defaclrole=(SELECT oid FROM pg_roles WHERE rolname=${owner})) AS default_acls,
        pg_backend_pid()::int AS pid FROM db_acl CROSS JOIN schema_acl
    `;
    if (signal.aborted) throw new Error('MIGRATION_RUNTIME_ROLE_ABORTED');
    const row = rows[0];
    if (row?.server_major !== 16 || !row.owner || !row.runtime)
      throw new Error('MIGRATION_RUNTIME_ROLE_MANIFEST_REJECTED');
    const privileges = Object.freeze(
      Object.fromEntries(PRIVILEGES.map(key => [key, row[key]])) as Record<Privilege, boolean>
    );
    const ownerSafe = Object.values(row.owner_classes).every(Boolean);
    // prettier-ignore
    const manifest=Object.freeze({contract_version:'migration_runtime_role_manifest_v1' as const,server_major:16 as const,migration_owner_safe:safe(row.owner)&&ownerSafe,runtime_role_safe:safe(row.runtime)&&row.membership_paths===0&&row.runtime_owned===0,owner_classes:Object.freeze(row.owner_classes),runtime_membership_paths:row.membership_paths,runtime_owned_objects:row.runtime_owned,privileges,public_create_on_public:row.public_create,runtime_create_on_public:row.runtime_create,default_acl_rows:row.default_acls,default_acl_engine_defaults:row.default_acls===0,redacted:true as const});
    await sql.end({ timeout: 1 });
    return { manifest, closedPid: row.pid };
  } catch (error) {
    await sql.end({ timeout: 1 }).catch(() => {});
    const code =
      error instanceof Error && /^MIGRATION_RUNTIME_ROLE_[A-Z_]+$/u.test(error.message)
        ? error.message
        : 'MIGRATION_RUNTIME_ROLE_MANIFEST_REJECTED';
    throw new Error(code);
  }
}
