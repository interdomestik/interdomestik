import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { describeDatabaseUrl } from '../redact-database-url.mjs';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readRepoFile(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('m4 gatekeeper force-cleans stale Supabase containers before retrying supabase start', () => {
  const gatekeeperScript = readRepoFile('scripts/m4-gatekeeper.sh');

  assert.match(gatekeeperScript, /cleanup_stale_supabase_containers\(\)/);
  assert.match(gatekeeperScript, /docker ps -a --format '\{\{\.Names\}\}'/);
  assert.match(gatekeeperScript, /grep '\^supabase_\.\*_interdomestik\$'/);
  assert.match(gatekeeperScript, /xargs docker rm -f/);
  assert.match(
    gatekeeperScript,
    /supabase stop --project-id interdomestik[\s\S]*supabase stop[\s\S]*cleanup_stale_supabase_containers[\s\S]*supabase start/
  );
});

test('m4 gatekeeper diagnostics never print database credentials', () => {
  const gatekeeperScript = readRepoFile('scripts/m4-gatekeeper.sh');
  const echoes = gatekeeperScript
    .split('\n')
    .filter(line => /echo .*\$\{?DATABASE_URL\b/u.test(line));
  assert.ok(echoes.length >= 2);
  for (const line of echoes) {
    // The URL reaches the redactor on stdin from a builtin, never in a process argv.
    assert.ok(
      line.includes(
        `$(printf '%s' "\${DATABASE_URL}" | node "\${SCRIPT_DIR}/redact-database-url.mjs")`
      ),
      line
    );
  }
  const sentinel = 'SENTINEL-p@ss:word';
  const cases = [
    [`postgresql://postgres:${sentinel}@127.0.0.1:55438/db`, 'postgresql://127.0.0.1:55438/db'],
    [`postgresql://127.0.0.1:5432/db?password=${sentinel}`, 'postgresql://127.0.0.1:5432/db'],
    [`postgresql://u:${sentinel}@host/db`, 'postgresql://host:(no port)/db'],
    [`not a url ${sentinel}`, '(not a URL)'],
  ];
  for (const [input, expected] of cases) {
    assert.equal(describeDatabaseUrl(input), expected);
  }
  const output = execFileSync(
    process.execPath,
    [path.join(rootDir, 'scripts/redact-database-url.mjs')],
    {
      encoding: 'utf8',
      input: cases[0][0],
    }
  );
  assert.equal(output, cases[0][1]);
  assert.ok(!output.includes('SENTINEL'));
});
