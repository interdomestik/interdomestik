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

test('qa server loads the same root env file precedence as the repo runtime', () => {
  const serverSource = readText('packages/qa/src/server.ts');
  const utilsSource = readText('packages/qa/src/tools/audits/utils.ts');

  assert.match(utilsSource, /findRootEnvFile/);
  assert.match(utilsSource, /\.env\.local/);
  assert.match(utilsSource, /\.env\.development\.local/);
  assert.match(utilsSource, /'\.env'/);
  assert.match(serverSource, /findRootEnvFile/);
  assert.doesNotMatch(serverSource, /dotenv\.config\(\{ path: path\.join\(REPO_ROOT, '\.env'\)/);
});
