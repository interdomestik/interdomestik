import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import type { TestContext } from 'node:test';
import { fileURLToPath } from 'node:url';
import { sha256 } from '../../src/release-migrations';

export const folder = fileURLToPath(new URL('../../drizzle/', import.meta.url));
export const policy = path.join(folder, 'contract-phases.json');
const tags = ['0000_base', '0001_writer_expand', '0002_writer_contract', '0003_suffix'];
const statements = [
  'CREATE TABLE writer (id serial PRIMARY KEY, legacy integer NOT NULL)',
  'ALTER TABLE writer ADD COLUMN replacement integer DEFAULT 0 NOT NULL',
  'ALTER TABLE writer DROP COLUMN legacy',
  'ALTER TABLE writer ADD COLUMN suffix integer',
];
const pairs = { '0002_writer_contract': '0001_writer_expand' };

export function workspace(t: TestContext) {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-phase-'));
  t.after(() => rmSync(dir, { force: true, recursive: true }));
  return dir;
}

export function makeJournal(t: TestContext, { names = tags, contract = statements[2] } = {}) {
  const dir = workspace(t);
  const registry = path.join(dir, 'owner-policy.json');
  mkdirSync(path.join(dir, 'meta'));
  // Historical timestamps need not increase. PostgreSQL ledger insertion order is authoritative.
  const times = [20, 10, 30, 40, 50];
  const entries = names.map((tag, idx) => ({
    idx,
    version: '7',
    when: times[idx],
    tag,
    breakpoints: true,
  }));
  writeFileSync(path.join(dir, 'meta/_journal.json'), JSON.stringify({ version: '7', entries }));
  writeFileSync(
    registry,
    JSON.stringify({
      version: 1,
      pairs,
      sqlSha256: {
        '0001_writer_expand': sha256(statements[1]),
        '0002_writer_contract': sha256(contract),
      },
    })
  );
  entries.forEach(({ tag, idx }) =>
    writeFileSync(
      path.join(dir, `${tag}.sql`),
      idx === 2 ? contract : (statements[idx] ?? 'SELECT 1')
    )
  );
  return { dir, registry };
}
