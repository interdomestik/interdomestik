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

test('qa server keeps env loading stateless and selected per tool call', () => {
  const serverSource = readText('packages/qa/src/server.ts');
  const rootEnvSource = readText('packages/qa/src/utils/root-env.ts');
  const toolRepoRootSource = readText('packages/qa/src/utils/tool-repo-root.ts');

  assert.doesNotMatch(serverSource, /dotenv|findRootEnvFile|process\.chdir|setRoot/);
  assert.match(rootEnvSource, /ROOT_ENV_FILE_CANDIDATES/);
  assert.match(rootEnvSource, /\.env\.local/);
  assert.match(rootEnvSource, /\.env\.development\.local/);
  assert.match(rootEnvSource, /'\.env'/);
  assert.match(rootEnvSource, /dotenv\.parse/);
  assert.doesNotMatch(rootEnvSource, /dotenv\.config|\.\.\.process\.env/);
  assert.match(rootEnvSource, /SAFE_PROCESS_ENV_KEYS/);
  assert.match(rootEnvSource, /buildToolProcessEnv/);
  assert.match(rootEnvSource, /\): NodeJS\.ProcessEnv \{/);
  assert.match(toolRepoRootSource, /const GIT_BIN = '\/usr\/bin\/git'/);
  assert.match(toolRepoRootSource, /execFileSync\(GIT_BIN/);
  assert.doesNotMatch(toolRepoRootSource, /execFileSync\('git'/);
  assert.doesNotMatch(toolRepoRootSource, /missingSegments\.reverse\(\)/);
});
