import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(scriptDir, '../..');

function readText(relativePath) {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

test('repo .envrc loads the Node version declared in .nvmrc', () => {
  const envrc = readText('.envrc');

  assert.match(envrc, /NODE_VERSIONS=/);
  assert.match(envrc, /use node/);
  assert.match(envrc, /dotenv_if_exists \.env\.local/);
});

test('node guard reads the required major version from .nvmrc', () => {
  const guardScript = readText('scripts/node-guard.sh');

  assert.match(guardScript, /\.nvmrc/);
  assert.doesNotMatch(guardScript, /REQUIRED_MAJOR="20"/);
});
