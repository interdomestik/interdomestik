import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
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

test('audit tools bind their reads to the selected worktree', () => {
  const listSource = readText('packages/qa/src/tools/list-tools.ts');
  const routerSource = readText('packages/qa/src/tool-router.ts');
  for (const name of ['audit_auth', 'audit_dependencies', 'audit_supabase']) {
    assert.match(listSource, new RegExp(`createRepoNoArgTool\\(\\s*'${name}'`));
    assert.match(routerSource, new RegExp(`${name}: args =>`));
  }
  const sibling = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-audit-worktree-'));
  try {
    execFileSync('/usr/bin/git', ['worktree', 'add', '--detach', sibling, 'HEAD'], {
      cwd: rootDir,
    });
    const source = `const { handleToolCall } = await import('./packages/qa/src/tool-router.ts');
      const result = await handleToolCall('audit_dependencies', { repoRoot: process.env.QA_TARGET_ROOT });
      process.stdout.write(result.content[0].text);`;
    const result = spawnSync(
      process.execPath,
      ['--import', 'tsx', '--input-type=module', '--eval', source],
      {
        cwd: rootDir,
        encoding: 'utf8',
        env: { ...process.env, QA_TARGET_ROOT: sibling },
      }
    );
    assert.equal(result.status, 0, result.stderr);
    assert.ok(result.stdout.includes(`TARGET: ${fs.realpathSync.native(sibling)}`));
  } finally {
    execFileSync('/usr/bin/git', ['worktree', 'remove', '--force', sibling], { cwd: rootDir });
  }
});
