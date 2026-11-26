import {
  sponsorCheckpointGrants,
  sponsorRuntimeRole,
  type ReleaseSql,
} from './release-sponsor-checkpoint';

const sponsorRelations = [
  'sponsors',
  'sponsor_terms',
  'sponsor_term_revisions',
  'sponsor_revision_decisions',
  'sponsor_roster_entries',
  'sponsor_handover_intents',
  'sponsor_handover_cancel_attempts',
  'sponsor_handover_charges',
  'sponsor_mail_outbox',
];
const relations = [
  ...new Set([...sponsorRelations, ...sponsorCheckpointGrants.map(([table]) => table)]),
];

export async function inspectReleaseSponsorAcl(sql: ReleaseSql) {
  return await sql<
    {
      relation: string;
      forcedRls: boolean;
      tableAcl: string | null;
      effectiveTable: string[];
      triggers: { name: string; enabled: string; definition: string }[];
      columns: { name: string; acl: string | null; effective: string[] }[];
    }[]
  >`
    select c.relname as relation,
      c.relrowsecurity and c.relforcerowsecurity as "forcedRls",
      c.relacl::text as "tableAcl",
      array(
        select privilege from unnest(array[
          'SELECT', 'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'REFERENCES', 'TRIGGER',
          'SELECT WITH GRANT OPTION', 'INSERT WITH GRANT OPTION', 'UPDATE WITH GRANT OPTION',
          'DELETE WITH GRANT OPTION', 'TRUNCATE WITH GRANT OPTION',
          'REFERENCES WITH GRANT OPTION', 'TRIGGER WITH GRANT OPTION'
        ]) as p(privilege) where has_table_privilege(${sponsorRuntimeRole}, c.oid, privilege)
      ) as "effectiveTable",
      coalesce((select jsonb_agg(jsonb_build_object(
        'name', t.tgname, 'enabled', t.tgenabled, 'definition', pg_get_triggerdef(t.oid)
      ) order by t.tgname) from pg_trigger t where t.tgrelid = c.oid and not t.tgisinternal),
        '[]'::jsonb) as triggers,
      (select jsonb_agg(jsonb_build_object(
        'name', a.attname, 'acl', a.attacl::text, 'effective', array(
          select privilege from unnest(array[
            'SELECT', 'INSERT', 'UPDATE', 'REFERENCES',
            'SELECT WITH GRANT OPTION', 'INSERT WITH GRANT OPTION', 'UPDATE WITH GRANT OPTION',
            'REFERENCES WITH GRANT OPTION'
          ]) as p(privilege)
          where has_column_privilege(${sponsorRuntimeRole}, c.oid, a.attnum, privilege)
        )
      ) order by a.attnum) from pg_attribute a
        where a.attrelid = c.oid and a.attnum > 0 and not a.attisdropped) as columns
    from pg_class c
    where c.relnamespace = 'public'::regnamespace and c.relname::text = any(${relations}::text[])
    order by c.relname
  `;
}
