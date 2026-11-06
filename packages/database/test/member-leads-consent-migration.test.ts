import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { memberLeads } from '../src/schema';

const databaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const MIGRATION = 'drizzle/0097_member_leads_consent.sql';

function readMigration(): Promise<string> {
  return readFile(path.join(databaseRoot, MIGRATION), 'utf8');
}

test('ACQ-1b schema requires a consent notice version and capture channel on every lead', () => {
  assert.equal(memberLeads.consentNoticeVersion.notNull, true);
  assert.equal(memberLeads.captureChannel.notNull, true);
  assert.equal(memberLeads.leadKind.notNull, true);
  assert.equal(memberLeads.consentCapturedAt.notNull, false);
  assert.equal(memberLeads.consentCapturedBy.notNull, false);
});

test('ACQ-1b migration backfills existing leads as legacy and leaves new rows without defaults', async () => {
  const sql = await readMigration();

  // Existing rows get the explicit legacy marker; the default is dropped right after, so a new
  // row that omits consent fails NOT NULL instead of silently becoming a legacy lead.
  for (const [column, backfill] of [
    ['consent_notice_version', 'pre-consent-legacy'],
    ['capture_channel', 'legacy'],
  ]) {
    assert.match(
      sql,
      new RegExp(`ADD COLUMN "${column}" text DEFAULT '${backfill}' NOT NULL;`, 'u'),
      `${column} backfill`
    );
    assert.match(sql, new RegExp(`ALTER COLUMN "${column}" DROP DEFAULT;`, 'u'), column);
  }
  assert.doesNotMatch(sql, /ADD COLUMN "(consent_notice_version|capture_channel)" text NOT NULL;/u);
});

test('ACQ-1b migration enforces kind, channel, company and consent rules in the database', async () => {
  const sql = await readMigration();

  assert.match(
    sql,
    /"member_leads_lead_kind_check" CHECK \([^;]+in \('individual', 'company'\)\)/u
  );
  assert.match(
    sql,
    /"member_leads_capture_channel_check" CHECK \([^;]+in \('agent_assisted', 'public_form', 'legacy'\)\)/u
  );
  assert.match(
    sql,
    /"member_leads_company_check" CHECK \([^;]+= 'individual' or nullif\(btrim\("member_leads"\."company_name"\), ''\) is not null\)/u
  );
  const consent = sql.match(/"member_leads_consent_check" CHECK \(([\s\S]+?)\);/u)?.[1] ?? '';
  // A legacy row is only ever the backfill marker, never a new lead with a real notice.
  assert.match(
    consent,
    /"capture_channel" = 'legacy' and "member_leads"\."consent_notice_version" = 'pre-consent-legacy'\)/u
  );
  assert.match(consent, /"consent_captured_at" is not null/u);
  assert.match(consent, /"consent_notice_version" <> 'pre-consent-legacy'/u);
  assert.match(
    consent,
    /"capture_channel" <> 'agent_assisted' or [^)]*"consent_captured_by" is not null/u
  );
  assert.doesNotMatch(sql, /NOT VALID/u);
  assert.doesNotMatch(sql, /cascade/iu);
});

test('ACQ-1b migration reserves the legacy marker for backfilled rows only', async () => {
  const sql = await readMigration();

  const guard =
    sql.match(/FUNCTION member_leads_legacy_consent_guard_fn\(\)([\s\S]+?)\$\$;/u)?.[1] ?? '';
  assert.match(guard, /SET search_path = pg_catalog, public/u);
  assert.match(
    guard,
    /NEW\."capture_channel" = 'legacy'\s+AND \(TG_OP = 'INSERT' OR OLD\."capture_channel" IS DISTINCT FROM 'legacy'\)/u
  );
  assert.match(guard, /RAISE EXCEPTION[\s\S]+ERRCODE = 'check_violation'/u);
  assert.match(
    sql,
    /CREATE TRIGGER "member_leads_legacy_consent_guard"\s+BEFORE INSERT OR UPDATE OF "capture_channel" ON "member_leads"\s+FOR EACH ROW\s+EXECUTE FUNCTION member_leads_legacy_consent_guard_fn\(\);/u
  );
  // The trigger is created after the backfill, so only the migrated rows ever carry the marker.
  assert.ok(sql.indexOf('CREATE TRIGGER') > sql.indexOf(`DEFAULT 'legacy' NOT NULL`));
});
