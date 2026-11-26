import { createHash } from 'node:crypto';
import type { MigrationExecutionSql } from './migration-execution-contracts';

// Hash of prosrc, including its newlines, from the reviewed WP-07 contract SQL.
const REQUIRE_CHECK_SOURCE = 'b8762e83121e8a162bc41908c03dd59bbd5c04050baf9bf966d2741a76589d6a';
const WP07 = '0112_wp07_rate_check_contract';

async function verifyWp07(sql: MigrationExecutionSql, contracted: boolean) {
  const [shape] = await sql<{ expanded: boolean; weekly_count: number; named_weekly: boolean }[]>`
    WITH rates AS (
      SELECT pg_catalog.to_regclass('public.exchange_rates') AS oid
    ), verifications AS (
      SELECT pg_catalog.to_regclass('public.exchange_rate_verifications') AS oid
    ), uniqueness AS (
      SELECT i.*, c.conname, c.convalidated,
        ARRAY(SELECT a.attname::text FROM pg_catalog.unnest(i.indkey::smallint[]) WITH ORDINALITY AS k(num, pos)
          JOIN pg_catalog.pg_attribute a ON a.attrelid = i.indrelid AND a.attnum = k.num
          WHERE k.pos <= i.indnkeyatts ORDER BY k.pos) AS key_names
      FROM rates r JOIN pg_catalog.pg_index i ON i.indrelid = r.oid AND i.indisunique
      LEFT JOIN pg_catalog.pg_constraint c ON c.conindid = i.indexrelid AND c.conrelid = r.oid
    )
    SELECT (
      EXISTS (SELECT 1 FROM verifications v JOIN pg_catalog.pg_attribute a ON a.attrelid = v.oid
        WHERE a.attname = 'check_id' AND a.atttypid = 'pg_catalog.text'::pg_catalog.regtype
          AND NOT a.attnotnull AND NOT a.attisdropped)
      AND (SELECT count(*) = 2 AND bool_and(c.relkind = 'r' AND c.relrowsecurity AND c.relforcerowsecurity)
        FROM pg_catalog.pg_class c WHERE c.oid IN (
          pg_catalog.to_regclass('public.exchange_rate_check_events'),
          pg_catalog.to_regclass('public.exchange_rate_check_windows')))
      AND EXISTS (SELECT 1 FROM verifications v JOIN pg_catalog.pg_constraint c ON c.conrelid = v.oid
        WHERE c.conname = 'exchange_rate_verifications_check_fk' AND c.contype = 'f'
          AND c.convalidated AND NOT c.condeferrable
          AND c.confmatchtype = 's' AND c.confdeltype = 'a' AND c.confupdtype = 'a'
          AND c.confrelid = pg_catalog.to_regclass('public.exchange_rate_check_events')
          AND ARRAY(
            SELECT a.attname::text FROM pg_catalog.unnest(c.conkey) WITH ORDINALITY AS k(num, pos)
            JOIN pg_catalog.pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.num
            ORDER BY k.pos
          ) = ARRAY['tenant_id', 'book_id', 'check_id', 'legal_entity_id', 'verified_by', 'rate_id']
          AND ARRAY(
            SELECT a.attname::text FROM pg_catalog.unnest(c.confkey) WITH ORDINALITY AS k(num, pos)
            JOIN pg_catalog.pg_attribute a ON a.attrelid = c.confrelid AND a.attnum = k.num
            ORDER BY k.pos
          ) = ARRAY['tenant_id', 'book_id', 'id', 'legal_entity_id', 'actor_id', 'rate_id'])
      AND EXISTS (SELECT 1 FROM uniqueness WHERE conname = 'exchange_rates_tenant_book_date_revision_uq'
        AND key_names = ARRAY['tenant_id', 'book_id', 'effective_on', 'revision']
        AND convalidated AND indisvalid AND indisready AND indislive AND indpred IS NULL)
    ) AS expanded,
    (SELECT count(*)::int FROM uniqueness
      WHERE conname = 'exchange_rates_tenant_book_week_revision_uq'
        OR (cardinality(key_names) = indnkeyatts AND 'week_starts_on' = ANY(key_names)
          AND key_names <@ ARRAY['tenant_id', 'book_id', 'week_starts_on', 'revision']))
      AS weekly_count,
    EXISTS (SELECT 1 FROM uniqueness WHERE conname = 'exchange_rates_tenant_book_week_revision_uq'
      AND key_names = ARRAY['tenant_id', 'book_id', 'week_starts_on', 'revision']
      AND convalidated AND indisvalid AND indisready AND indislive AND indpred IS NULL) AS named_weekly
  `;
  const [fn] = await sql<{ source: string; valid: boolean }[]>`
    SELECT p.prosrc AS source, (
      p.pronargs = 0 AND p.prokind = 'f' AND p.prorettype = 'pg_catalog.trigger'::pg_catalog.regtype
      AND l.lanname = 'plpgsql' AND p.provolatile = 'v' AND NOT p.prosecdef
      AND p.proconfig = ARRAY['search_path=pg_catalog, public']
    ) AS valid
    FROM pg_catalog.pg_proc p JOIN pg_catalog.pg_language l ON l.oid = p.prolang
    WHERE p.oid = pg_catalog.to_regprocedure('public.exchange_rate_verifications_require_check_fn()')
  `;
  const [trigger] = await sql<{ definition: string; valid: boolean }[]>`
    SELECT pg_catalog.pg_get_triggerdef(t.oid) AS definition,
      (t.tgenabled IN ('O', 'A') AND t.tgtype = 7 AND NOT t.tgisinternal
        AND t.tgfoid = pg_catalog.to_regprocedure('public.exchange_rate_verifications_require_check_fn()'))
      AS valid
    FROM pg_catalog.pg_trigger t
    WHERE t.tgrelid = pg_catalog.to_regclass('public.exchange_rate_verifications')
      AND t.tgname = 'exchange_rate_verifications_check_required'
  `;
  const guard =
    fn?.valid === true &&
    createHash('sha256').update(fn.source).digest('hex') === REQUIRE_CHECK_SOURCE &&
    trigger?.valid === true &&
    / WHEN \(+new\.check_id IS NULL\)+ EXECUTE FUNCTION public\.exchange_rate_verifications_require_check_fn\(\)$/u.test(
      trigger.definition
    );
  if (
    !shape?.expanded ||
    (contracted
      ? shape.weekly_count !== 0 || !guard
      : shape.weekly_count !== 1 || !shape.named_weekly || fn || trigger)
  )
    throw new Error('PHASE_SCHEMA_DIVERGENT');
}

async function verifyScratch(sql: MigrationExecutionSql, contracted: boolean) {
  const rows = await sql<{ name: string; required: boolean }[]>`
    SELECT a.attname AS name, a.attnotnull AS required FROM pg_catalog.pg_attribute a
    WHERE a.attrelid = pg_catalog.to_regclass('public.writer') AND a.attnum > 0 AND NOT a.attisdropped
      AND a.atttypid = 'pg_catalog.int4'::pg_catalog.regtype
    ORDER BY a.attnum
  `;
  const columns = rows.filter(row => row.name !== 'suffix').map(row => [row.name, row.required]);
  const expected = contracted
    ? [
        ['id', true],
        ['replacement', true],
      ]
    : [
        ['id', true],
        ['legacy', true],
        ['replacement', true],
      ];
  if (JSON.stringify(columns) !== JSON.stringify(expected))
    throw new Error('PHASE_SCHEMA_DIVERGENT');
}

export async function verifyReleaseShape(
  sql: MigrationExecutionSql,
  contractTag: string,
  contracted: boolean,
  scratch: boolean
) {
  if (contractTag === WP07) await verifyWp07(sql, contracted);
  else if (scratch && contractTag === '0002_writer_contract') await verifyScratch(sql, contracted);
  else throw new Error('PHASE_SHAPE_POLICY_MISSING');
}
