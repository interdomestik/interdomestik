import assert from 'node:assert/strict';
import { copyFileSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import type { TestContext } from 'node:test';
import { readReleaseJournal } from '../../src/release-migrations';
import { assertLedger, type withReleaseDatabase } from './release-migration-fixture';
import { folder, policy, workspace } from './release-migration-journal.fixture';
import type { ScratchClient } from './scratch-database';

export const tag0114 = '0114_wp12_1_inbound_documents';
export const tag0115 = '0115_case_tenant_binding';

export type Fixture = Parameters<Parameters<typeof withReleaseDatabase>[2]>[1];

export function candidate(t: TestContext, through = 115) {
  const dir = workspace(t);
  const journalPath = join(dir, 'meta/_journal.json');
  const raw: {
    version: string;
    entries: { idx: number; when: number; tag: string; version: string; breakpoints: boolean }[];
  } = JSON.parse(readFileSync(join(folder, 'meta/_journal.json'), 'utf8'));
  assert.equal(raw.entries[114]?.tag, tag0114);
  assert.equal(raw.entries[115]?.tag, tag0115);
  const entries = raw.entries.slice(0, through + 1);
  mkdirSync(join(dir, 'meta'));
  const writeJournal = (suffix = entries) =>
    writeFileSync(journalPath, JSON.stringify({ ...raw, entries: suffix }));
  writeJournal();
  for (const { tag } of entries) copyFileSync(join(folder, `${tag}.sql`), join(dir, `${tag}.sql`));
  return { dir, entries, writeJournal };
}

export function repin(fixture: Fixture, dir: string) {
  const { journalSha256, ledgerSha256, registrySha256 } = readReleaseJournal(dir, policy, {
    candidateRoot: dir,
    policyRoot: folder,
  });
  writeFileSync(
    fixture.files('config.json'),
    JSON.stringify({ ...fixture.config, journalSha256, ledgerSha256, registrySha256 })
  );
}

export async function to0113(client: ScratchClient, fixture: Fixture) {
  const plan = await fixture.expand();
  assert.equal(plan.expand.tag, '0112_wp07_rate_check_expand');
  assert.equal(plan.contract?.tag, '0113_wp07_rate_check_contract');
  await assertLedger(client, fixture.journal, 113);
  const result = await fixture.run('contract', fixture.approval());
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'contracted');
  await assertLedger(client, fixture.journal, 114);
  // expand() overwrites manifest.json on success. Keep the signed 0113 input bytes separately.
  const original = fixture.files('contract-0113.json');
  writeFileSync(original, readFileSync(fixture.files('manifest.json')));
  return { RELEASE_PHASE_MANIFEST: original };
}

export async function verifyRecovery(
  fixture: Fixture,
  manifest: { RELEASE_PHASE_MANIFEST: string }
) {
  const result = await fixture.run('recover', manifest);
  assert.equal(result.code, 0, result.stderr);
  assert.equal(JSON.parse(result.stdout).status, 'verified-committed');
}
