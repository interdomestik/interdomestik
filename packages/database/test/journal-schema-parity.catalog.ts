// CHK-12, fourth part: the catalog reader. PostgreSQL renders every expression (defaults, checks,
// index definitions, policies), for the built database and for the twin of the declared schema
// alike, under one fixed search_path, so that no text normalization stands between the two.

/** The schema that holds the twin of the declared schema while the comparison runs. */
export const TWIN_SCHEMA = '__wp04_declared_twin';
/** Every read runs under this search_path, so both sides render names the same way. */
export const FIXED_SEARCH_PATH = 'set search_path to public';

export type FactRow = Readonly<{ kind: string; parts: readonly unknown[]; value: string }>;

const SYSTEM_SCHEMAS = `n.nspname not in ('pg_catalog', 'information_schema', 'pg_toast', '${TWIN_SCHEMA}')
    and n.nspname !~ '^pg_(toast_)?temp_'`;

// Extension members (by catalog class and object id) and the migrator's own relation are not
// schema; everything else in a non-system schema is.
const member = (catalog: string, column: string) =>
  `exists (select 1 from pg_depend e where e.classid = '${catalog}'::regclass and e.objid = ${column} and e.deptype = 'e')`;

const scope = (namespaces: string) => `
with ns as (
  select n.oid, n.nspname from pg_namespace n
  where ${namespaces} and not ${member('pg_namespace', 'n.oid')}
),
rel as (
  select c.oid, c.relname, c.relkind, c.relrowsecurity, c.relforcerowsecurity, c.reloptions, ns.nspname
  from pg_class c join ns on ns.oid = c.relnamespace
  where c.relkind in ('r', 'p', 'v', 'm', 'S', 'f', 'c')
    and not ${member('pg_class', 'c.oid')}
    and not (ns.nspname = 'drizzle' and c.relname = '__drizzle_migrations')
    -- a sequence owned by a column (serial, identity) is part of that column
    and not (c.relkind = 'S' and exists (select 1 from pg_depend o where o.classid = 'pg_class'::regclass
      and o.objid = c.oid and o.refclassid = 'pg_class'::regclass and o.refobjsubid > 0 and o.deptype in ('a', 'i')))
)`;

const columnsOf = (key: string, relation: string) =>
  `array_to_json(array(select a.attname from unnest(${key}) with ordinality k(num, ord)
    join pg_attribute a on a.attrelid = ${relation} and a.attnum = k.num order by k.ord))`;
const deferrable = `case when con.condeferrable then ' deferrable'
    || case when con.condeferred then ' initially deferred' else '' end else '' end`;
const action = (
  column: string
) => `case ${column} when 'a' then 'no action' when 'r' then 'restrict'
    when 'c' then 'cascade' when 'n' then 'set null' when 'd' then 'set default' end`;

// Facts that the declared schema can also state: read from the built database and from the twin.
const RENDERED_FACTS = `
select 'column' as kind, json_build_array(r.nspname, r.relname, a.attname) as parts,
  format_type(a.atttypid, a.atttypmod)
    || case when a.attnotnull then ' not null' else '' end
    || case when a.attidentity <> '' then ' identity=' || a.attidentity::text else '' end
    || case when a.attgenerated <> '' then ' generated=' || a.attgenerated::text else '' end
    || case when a.attcollation <> t.typcollation then ' collate ' || a.attcollation::regcollation::text
       else '' end as value
  from rel r join pg_attribute a on a.attrelid = r.oid and a.attnum > 0 and not a.attisdropped
  join pg_type t on t.oid = a.atttypid
  where r.relkind in ('r', 'p', 'v', 'm', 'f', 'c')
union all
select 'default', json_build_array(r.nspname, r.relname, a.attname), pg_get_expr(d.adbin, d.adrelid)
  from rel r join pg_attrdef d on d.adrelid = r.oid
  join pg_attribute a on a.attrelid = r.oid and a.attnum = d.adnum and not a.attisdropped
union all
select 'check', json_build_array(r.nspname, r.relname, con.conname),
  pg_get_expr(con.conbin, con.conrelid) || case when con.connoinherit then ' no inherit' else '' end
  from pg_constraint con join rel r on r.oid = con.conrelid where con.contype = 'c'
union all
select 'index', json_build_array(r.nspname, r.relname, i.relname),
  case when x.indisunique then 'unique ' else '' end || case
    when starts_with(d.def, d.prefix) then substr(d.def, length(d.prefix) + 1)
    when starts_with(d.def, d.only_prefix) then substr(d.def, length(d.only_prefix) + 1)
    else d.def end
  from pg_index x join pg_class i on i.oid = x.indexrelid join rel r on r.oid = x.indrelid
  cross join lateral (select pg_get_indexdef(x.indexrelid) as def,
    'CREATE ' || case when x.indisunique then 'UNIQUE ' else '' end || 'INDEX ' || quote_ident(i.relname)
      || ' ON ' || quote_ident(r.nspname) || '.' || quote_ident(r.relname) || ' USING ' as prefix,
    'CREATE ' || case when x.indisunique then 'UNIQUE ' else '' end || 'INDEX ' || quote_ident(i.relname)
      || ' ON ONLY ' || quote_ident(r.nspname) || '.' || quote_ident(r.relname) || ' USING ' as only_prefix) d
  where not exists (select 1 from pg_constraint con where con.conindid = x.indexrelid
    and con.conrelid = x.indrelid and con.contype in ('p', 'u', 'x'))
union all
select 'policy', json_build_array(r.nspname, r.relname, p.polname),
  case when p.polpermissive then 'permissive' else 'restrictive' end || ' for ' || case p.polcmd
    when '*' then 'all' when 'r' then 'select' when 'a' then 'insert' when 'w' then 'update'
    when 'd' then 'delete' end
  || ' to ' || array_to_json(array(select case when role = 0 then 'public' else role::regrole::text end
       from unnest(p.polroles) role order by 1))::text
  || ' using ' || coalesce(pg_get_expr(p.polqual, p.polrelid), '-')
  || ' check ' || coalesce(pg_get_expr(p.polwithcheck, p.polrelid), '-')
  from pg_policy p join rel r on r.oid = p.polrelid`;

// Facts only the built database has; the declared side states them structurally or not at all.
const BUILT_ONLY_FACTS = `
union all
select 'schema', json_build_array(nspname), 'schema' from ns where nspname <> 'drizzle'
union all
select 'extension', json_build_array(extname), 'extension' from pg_extension where extname <> 'plpgsql'
union all
select 'relation', json_build_array(nspname, relname), case relkind when 'r' then 'table'
    when 'p' then 'partitioned table' when 'v' then 'view' when 'm' then 'materialized view'
    when 'S' then 'sequence' when 'f' then 'foreign table' when 'c' then 'composite type' end
  from rel
union all
select 'relation-options', json_build_array(nspname, relname), array_to_json(reloptions)::text
  from rel where reloptions is not null
union all
select 'rls', json_build_array(nspname, relname), 'enabled'
  from rel where relkind in ('r', 'p') and relrowsecurity
union all
select 'rls-force', json_build_array(nspname, relname), 'forced'
  from rel where relkind in ('r', 'p') and relforcerowsecurity
union all
select 'view-definition', json_build_array(nspname, relname), md5(pg_get_viewdef(oid, true))
  from rel where relkind in ('v', 'm')
union all
select 'pk', json_build_array(r.nspname, r.relname),
  con.conname || ' ' || ${columnsOf('con.conkey', 'con.conrelid')}::text || ${deferrable}
  from pg_constraint con join rel r on r.oid = con.conrelid where con.contype = 'p'
union all
select 'unique', json_build_array(r.nspname, r.relname, con.conname),
  ${columnsOf('con.conkey', 'con.conrelid')}::text
    || case when x.indnullsnotdistinct then ' nulls not distinct' else '' end || ${deferrable}
  from pg_constraint con join rel r on r.oid = con.conrelid join pg_index x on x.indexrelid = con.conindid
  where con.contype = 'u'
union all
select 'exclusion', json_build_array(r.nspname, r.relname, con.conname), pg_get_constraintdef(con.oid)
  from pg_constraint con join rel r on r.oid = con.conrelid where con.contype = 'x'
union all
select 'fk', json_build_array(r.nspname, r.relname, ${columnsOf('con.conkey', 'con.conrelid')},
    tn.nspname, t.relname, ${columnsOf('con.confkey', 'con.confrelid')}),
  'delete=' || ${action('con.confdeltype')} || ' update=' || ${action('con.confupdtype')}
    || ' match=' || con.confmatchtype::text || ${deferrable}
  from pg_constraint con join rel r on r.oid = con.conrelid
  join pg_class t on t.oid = con.confrelid join pg_namespace tn on tn.oid = t.relnamespace
  where con.contype = 'f'
union all
select 'not-valid', json_build_array(r.nspname, r.relname, con.conname), con.contype::text
  from pg_constraint con join rel r on r.oid = con.conrelid where not con.convalidated
union all
select 'constraint-enforcement', json_build_array(r.nspname, r.relname, con.conname),
  string_agg(distinct t.tgenabled::text, ',' order by t.tgenabled::text)
  from pg_trigger t join pg_constraint con on con.oid = t.tgconstraint join rel r on r.oid = con.conrelid
  where t.tgisinternal group by r.nspname, r.relname, con.conname having bool_or(t.tgenabled <> 'O')
union all
select 'invalid-index', json_build_array(r.nspname, r.relname, i.relname), 'invalid'
  from pg_index x join pg_class i on i.oid = x.indexrelid join rel r on r.oid = x.indrelid
  where not (x.indisvalid and x.indisready and x.indislive)
union all
select 'enum', json_build_array(ns.nspname, t.typname),
  array_to_json(array(select e.enumlabel from pg_enum e where e.enumtypid = t.oid order by e.enumsortorder))::text
  from pg_type t join ns on ns.oid = t.typnamespace
  where t.typtype = 'e' and not ${member('pg_type', 't.oid')}
union all
select 'type', json_build_array(ns.nspname, t.typname), t.typtype::text || ' ' || case when t.typtype = 'd'
    then format_type(t.typbasetype, t.typtypmod) || case when t.typnotnull then ' not null' else '' end
    else '' end
  from pg_type t join ns on ns.oid = t.typnamespace
  where t.typtype in ('b', 'd', 'r', 'm') and t.typrelid = 0 and not ${member('pg_type', 't.oid')}
    and not exists (select 1 from pg_type element where element.typarray = t.oid)
union all
select 'trigger', json_build_array(r.nspname, r.relname, t.tgname),
  pg_get_triggerdef(t.oid) || case when t.tgenabled <> 'O' then ' enabled=' || t.tgenabled::text else '' end
  from pg_trigger t join rel r on r.oid = t.tgrelid where not t.tgisinternal
union all
select 'rule', json_build_array(r.nspname, r.relname, w.rulename), md5(pg_get_ruledef(w.oid))
  from pg_rewrite w join rel r on r.oid = w.ev_class where w.rulename <> '_RETURN'
union all
select 'function', json_build_array(ns.nspname,
    p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'),
  case when p.prokind in ('f', 'p', 'w') then md5(pg_get_functiondef(p.oid)) else p.prokind::text end
  from pg_proc p join ns on ns.oid = p.pronamespace where not ${member('pg_proc', 'p.oid')}
union all
select 'event-trigger', json_build_array(evtname), evtevent || ' ' || evtfoid::regproc::text
  from pg_event_trigger where not ${member('pg_event_trigger', 'oid')}`;

/** Every fact of a built database, in every non-system schema. */
export const BUILT_FACTS_SQL = `${scope(SYSTEM_SCHEMAS)}\n${RENDERED_FACTS}\n${BUILT_ONLY_FACTS}`;

/** The rendered facts of the twin, read back under the twin schema's name. */
const TWIN_NAMESPACE = `n.nspname = '${TWIN_SCHEMA}'`;
export const TWIN_FACTS_SQL = `${scope(TWIN_NAMESPACE)}\n${RENDERED_FACTS}`;

export function factKey(kind: string, parts: readonly unknown[]): string {
  return `${kind} ${JSON.stringify(parts)}`;
}

/** Rows to facts. `renamedSchema` maps the twin schema back to the schema it stands for. */
export function catalogFacts(
  rows: readonly FactRow[],
  renamedSchema?: string
): Map<string, string> {
  const facts = new Map<string, string>();
  for (const { kind, parts, value } of rows) {
    const named =
      renamedSchema && parts[0] === TWIN_SCHEMA ? [renamedSchema, ...parts.slice(1)] : parts;
    const key = factKey(kind, named);
    if (facts.has(key)) throw new Error(`duplicate catalog key ${key}`);
    facts.set(key, value);
  }
  return facts;
}
