import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

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
