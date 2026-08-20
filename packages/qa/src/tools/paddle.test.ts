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

test('getPaddleResource rejects unsafe Paddle API base URLs before fetch', async () => {
  const selected = createWorktree(
    'PADDLE_API_KEY=test-key\nPADDLE_API_BASE=http://127.0.0.1:3000\n'
  );
  globalThis.fetch = async () => {
    throw new Error('fetch should not be called');
  };
  try {
    const result = await getPaddleResource({
      repoRoot: selected.repoRoot,
      resource: 'customers',
      id: 'ctm_123',
    });
    assert.match(result.content[0].text, /Paddle API base URL is not allowed/i);
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
    selected.remove();
  }
});

test('getPaddleResource keeps resource-controlled paths on the Paddle origin', async () => {
  const selected = createWorktree('PADDLE_API_KEY=test-key\n');
  let requestedUrl = '';
  globalThis.fetch = async input => {
    requestedUrl =
      typeof input === 'string'
        ? input
        : input instanceof URL
          ? input.href
          : input instanceof Request
            ? input.url
            : '';
    return new Response(JSON.stringify({ ok: true }), { status: 200 });
  };
  try {
    await getPaddleResource({
      repoRoot: selected.repoRoot,
      resource: '//attacker.example' as Parameters<typeof getPaddleResource>[0]['resource'],
      id: 'ctm_123',
    });
    assert.equal(new URL(requestedUrl).origin, 'https://api.paddle.com');
    assert.equal(new URL(requestedUrl).pathname, '/%2F%2Fattacker.example/ctm_123');
  } finally {
    globalThis.fetch = ORIGINAL_FETCH;
    selected.remove();
  }
});

test('selected worktree cannot inherit an ambient Paddle credential', async () => {
  const selected = createWorktree('');
  const previous = process.env.PADDLE_API_KEY;
  process.env.PADDLE_API_KEY = 'server-root-only';
  try {
    const result = await getPaddleResource({
      repoRoot: selected.repoRoot,
      resource: 'customers',
      id: 'ctm_123',
    });
    assert.equal(result.isError, true);
    assert.match(result.content[0].text, /Paddle API key missing/);
  } finally {
    if (previous === undefined) delete process.env.PADDLE_API_KEY;
    else process.env.PADDLE_API_KEY = previous;
    selected.remove();
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
