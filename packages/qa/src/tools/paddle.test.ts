import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { getPaddleResource } from './paddle.js';
import { queryDb } from './db.js';

const ORIGINAL_FETCH = globalThis.fetch;
const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../..');

function createWorktree(envFile: string) {
  const repoRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-paddle-worktree-'));
  execFileSync('git', ['worktree', 'add', '--detach', repoRoot, 'HEAD'], { cwd: REPO_ROOT });
  fs.writeFileSync(path.join(repoRoot, '.env.local'), envFile);
  return {
    repoRoot: fs.realpathSync.native(repoRoot),
    remove: () =>
      execFileSync('git', ['worktree', 'remove', '--force', repoRoot], { cwd: REPO_ROOT }),
  };
}

test('getPaddleResource returns closed before any environment or provider access', async () => {
  const previous = process.env.PADDLE_API_KEY;
  process.env.PADDLE_API_KEY = 'paddle-api-key-fixture';
  let fetchCalls = 0;
  globalThis.fetch = async () => {
    fetchCalls++;
    throw new Error('fetch should not be called');
  };

  try {
    const result = await getPaddleResource({
      get repoRoot(): string {
        throw new Error('Paddle closure should not resolve a worktree or load its environment');
      },
      resource: 'customers',
      id: 'ctm_123',
    });
    assert.equal(result.isError, true);
    assert.equal(result.structuredContent.code, 'PADDLE_CLOSED');
    assert.match(result.content[0].text, /Paddle is closed/);
    assert.equal(fetchCalls, 0);
  } finally {
    if (previous === undefined) delete process.env.PADDLE_API_KEY;
    else process.env.PADDLE_API_KEY = previous;
    globalThis.fetch = ORIGINAL_FETCH;
  }
});

test('selected worktree cannot inherit an ambient database credential', async () => {
  const selected = createWorktree('');
  const previous = process.env.DATABASE_URL;
  process.env.DATABASE_URL = 'postgres://server-root-only';
  try {
    const result = await queryDb({
      repoRoot: selected.repoRoot,
      text: 'SELECT 1',
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /DATABASE_URL not set/);
  } finally {
    if (previous === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previous;
    selected.remove();
  }
});
