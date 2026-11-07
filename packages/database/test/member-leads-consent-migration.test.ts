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
  const checkOf = (name: string) =>
    sql.match(
      new RegExp(`"${name}" CHECK \\(([\\s\\S]+?)\\);--> statement-breakpoint`, 'u')
    )?.[1] ?? '';

  assert.match(
    checkOf('member_leads_lead_kind_check'),
    /"lead_kind" in \('individual', 'company'\)/u
  );
  assert.match(
    checkOf('member_leads_company_check'),
    /"lead_kind" <> 'company' or nullif\(btrim\("member_leads"\."company_name"\), ''\) is not null/u
  );
  // The legacy notice version and the legacy channel only ever come together.
  const channel = checkOf('member_leads_capture_channel_check');
  assert.match(
    channel,
    /case when "member_leads"\."consent_notice_version" = 'pre-consent-legacy' then "member_leads"\."capture_channel" = 'legacy'/u
  );
  assert.match(
    channel,
    /else "member_leads"\."capture_channel" in \('agent_assisted', 'public_form'\) end/u
  );
  // Captured consent has a time and, agent-assisted, the agent; only a legacy row has none.
  const consent = checkOf('member_leads_consent_check');
  assert.match(
    consent,
    /when 'public_form' then "member_leads"\."consent_captured_at" is not null/u
  );
  assert.match(
    consent,
    /when 'agent_assisted' then "member_leads"\."consent_captured_at" is not null and "member_leads"\."consent_captured_by" is not null/u
  );
  assert.match(consent, /else "member_leads"\."consent_captured_at" is null end/u);
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
    /NEW\."consent_captured_at" IS NULL\s+AND \(TG_OP = 'INSERT' OR OLD\."consent_captured_at" IS NOT NULL\)/u
  );
  assert.match(guard, /RAISE EXCEPTION[\s\S]+ERRCODE = 'check_violation'/u);
  assert.match(
    sql,
    /CREATE TRIGGER "member_leads_legacy_consent_guard"\s+BEFORE INSERT OR UPDATE OF "consent_captured_at" ON "member_leads"\s+FOR EACH ROW\s+EXECUTE FUNCTION member_leads_legacy_consent_guard_fn\(\);/u
  );
  // The trigger is created after the backfill, so only the migrated rows ever carry the marker.
  assert.ok(sql.indexOf('CREATE TRIGGER') > sql.indexOf(`DEFAULT 'legacy' NOT NULL`));
});
