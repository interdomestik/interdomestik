import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = new URL('../../', import.meta.url);
const head = '1'.repeat(40);

function readiness(env = {}) {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'pr-ready-'));
  const bin = path.join(directory, 'bin');
  fs.mkdirSync(bin);
  fs.mkdirSync(path.join(directory, 'scripts/ci'), { recursive: true });
  for (const file of [
    'pr-review-ready.sh',
    'pr-finalizer-lib.sh',
    'ci/pr-delivery-contract.json',
  ]) {
    fs.copyFileSync(new URL(`scripts/${file}`, root), path.join(directory, 'scripts', file));
  }
  const commands = {
    git: `case "$1" in
      status) test "\$DIRTY" != 1 || echo ' M source.ts';;
      rev-parse) echo '${head}';;
      *) exit 99;;
    esac`,
    gh: `case "$1 $2" in
      'pr view')
        if test -f "$CALL_LOG" && test "\$DRIFT" = 1; then echo '${'2'.repeat(40)}';
        else echo "\$PR_HEAD"; fi;;
      'repo view') echo interdomestik/interdomestik;;
      'api --paginate') echo scripts/example.mjs;;
      *) exit 99;;
    esac`,
    node: `case "$1" in
      scripts/plan-conformance/boundary-diff-report.mjs) echo '{"no_go":false}';;
      scripts/github-pr-governance-report.mjs)
        echo "$*" >> "$CALL_LOG"
        exit "\$GOVERNANCE_EXIT";;
      *) exit 99;;
    esac`,
    pnpm: 'echo "unexpected repeated verification" >&2; exit 99',
  };
  for (const [name, body] of Object.entries(commands)) {
    fs.writeFileSync(path.join(bin, name), '#!/bin/sh\n' + body + '\n', { mode: 0o755 });
  }
  try {
    const log = path.join(directory, 'calls');
    const result = spawnSync('bash', ['scripts/pr-review-ready.sh', '1694'], {
      cwd: directory,
      encoding: 'utf8',
      env: {
        PATH: `${bin}:${process.env.PATH}`,
        CALL_LOG: log,
        PR_HEAD: head,
        GOVERNANCE_EXIT: '0',
        ...env,
      },
    });
    return { ...result, calls: fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '' };
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
}

test('readiness reuses hosted finalizer and test evidence through strict governance', () => {
  const result = readiness();
  assert.equal(result.status, 0, result.stderr);
  assert.equal(result.calls, 'scripts/github-pr-governance-report.mjs --strict 1694\n');
});

test('dirty or different local sources cannot reuse PR evidence', () => {
  for (const env of [{ DIRTY: '1' }, { PR_HEAD: '2'.repeat(40) }]) {
    const result = readiness(env);
    assert.notEqual(result.status, 0);
    assert.equal(result.calls, '');
    assert.match(result.stderr, /not clean|differs from the pull request/u);
  }
});

test('readiness preserves failed or pending strict governance outcomes', () => {
  assert.equal(readiness({ GOVERNANCE_EXIT: '1' }).status, 1);
});

test('PR changes during readiness invalidate the reused evidence', () => {
  const result = readiness({ DRIFT: '1' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /candidate changed during readiness evaluation/u);
});
