import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const rootDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

function finalizerSource() {
  return fs
    .readFileSync(path.join(rootDir, 'scripts/pr-finalizer.sh'), 'utf8')
    .split('\nif [[ "${1:-}" == "--help"')[0]
    .replaceAll('$(dirname "${BASH_SOURCE[0]}")', '${REPLACEMENT_SCRIPT_DIR}');
}

function harnessEnv(extra = {}) {
  return {
    ...process.env,
    GH_TOKEN: 'fixture',
    REPLACEMENT_SCRIPT_DIR: path.join(rootDir, 'scripts'),
    ...extra,
  };
}

test('stale finalizer exits before checks or any other observable evaluation', () => {
  const expected = 'a'.repeat(40);
  const current = 'b'.repeat(40);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-finalizer-'));
  try {
    const marker = path.join(directory, 'continued');
    const harness = path.join(directory, 'harness.sh');
    fs.writeFileSync(
      harness,
      `${finalizerSource()}
gh() {
  [[ "$*" == *'/pulls/1761'* ]] || return 97
  printf '%s' '{"head":{"sha":"${current}"}}'
}
require_expected_head_current interdomestik/interdomestik 1761
printf reached >"$STALE_MARKER"
`,
      { mode: 0o600 }
    );
    const result = spawnSync('bash', ['--', harness], {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 5000,
      env: harnessEnv({ EXPECTED_HEAD_SHA: expected, STALE_MARKER: marker }),
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /stale event head/u);
    assert.equal(fs.existsSync(marker), false, 'stale execution must stop immediately');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('head advancement during review-thread validation prevents terminal PASS', () => {
  const expected = 'a'.repeat(40);
  const current = 'b'.repeat(40);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-review-threads-'));
  try {
    const marker = path.join(directory, 'passed');
    const harness = path.join(directory, 'harness.sh');
    fs.writeFileSync(
      harness,
      `${finalizerSource()}
require_review_threads_resolved() { :; }
gh() {
  [[ "$*" == *'/pulls/1761'* ]] || return 97
  printf '%s' '{"head":{"sha":"${current}"}}'
}
require_current_review_threads interdomestik/interdomestik 1761
printf passed >"$PASS_MARKER"
`,
      { mode: 0o600 }
    );
    const result = spawnSync('bash', ['--', harness], {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 5000,
      env: harnessEnv({ EXPECTED_HEAD_SHA: expected, PASS_MARKER: marker }),
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /stale event head/u);
    assert.equal(fs.existsSync(marker), false);
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('finalizer selects the newest provider result in all four result transitions', () => {
  const head = 'a'.repeat(40);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'provider-transitions-'));
  try {
    for (const [from, to] of [
      ['success', 'success'],
      ['success', 'failure'],
      ['failure', 'success'],
      ['failure', 'failure'],
    ]) {
      const checks = {
        check_runs: [
          {
            name: 'audit',
            app: { id: 15368 },
            head_sha: head,
            status: 'completed',
            conclusion: from,
            started_at: '2026-09-07T00:00:00Z',
          },
          {
            name: 'audit',
            app: { id: 15368 },
            head_sha: head,
            status: 'completed',
            conclusion: to,
            started_at: '2026-09-07T00:01:00Z',
          },
        ],
      };
      const harness = path.join(directory, `transition-${from}-${to}.sh`);
      fs.writeFileSync(
        harness,
        `${finalizerSource()}
resolve_matching_checks audit 15368 '${JSON.stringify(checks)}'
`,
        { mode: 0o600 }
      );
      const result = spawnSync('bash', ['--', harness], {
        cwd: rootDir,
        encoding: 'utf8',
        timeout: 5000,
        env: harnessEnv(),
      });
      assert.equal(result.status, 0, result.stdout + result.stderr);
      const selected = JSON.parse(result.stdout);
      assert.equal(selected.length, 1);
      assert.equal(selected[0].conclusion, to, `${from} -> ${to} must preserve the newer result`);
    }
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

test('finalizer exits stale during polling before another provider fetch', () => {
  const expected = 'a'.repeat(40);
  const current = 'b'.repeat(40);
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'stale-polling-'));
  try {
    const prCounter = path.join(directory, 'pr-calls');
    const checkCounter = path.join(directory, 'check-calls');
    const marker = path.join(directory, 'continued');
    fs.writeFileSync(prCounter, '0');
    fs.writeFileSync(checkCounter, '0');
    const inProgress = {
      name: 'audit',
      app: { id: 15368 },
      head_sha: expected,
      status: 'in_progress',
      conclusion: null,
      started_at: '2026-09-07T00:00:00Z',
    };
    const harness = path.join(directory, 'harness.sh');
    fs.writeFileSync(
      harness,
      `${finalizerSource()}
required_check_records() { printf 'audit\\t15368\\n'; }
defer_async_generators() { :; }
sleep() { :; }
gh() {
  if [[ "$*" == *'/pulls/1761'* ]]; then
    count="$(cat "$PR_COUNTER")"
    printf '%s' "$((count + 1))" >"$PR_COUNTER"
    if [[ "$count" -eq 0 ]]; then
      printf '%s' '{"head":{"sha":"${expected}"}}'
    else
      printf '%s' '{"head":{"sha":"${current}"}}'
    fi
    return
  fi
  count="$(cat "$CHECK_COUNTER")"
  printf '%s' "$((count + 1))" >"$CHECK_COUNTER"
  printf '%s' '${JSON.stringify([{ check_runs: [inProgress] }])}'
}
require_gh_checks
printf reached >"$STALE_MARKER"
`,
      { mode: 0o600 }
    );
    const result = spawnSync('bash', ['--', harness], {
      cwd: rootDir,
      encoding: 'utf8',
      timeout: 5000,
      env: harnessEnv({
        EXPECTED_HEAD_SHA: expected,
        PR_NUMBER: '1761',
        GITHUB_REPOSITORY: 'interdomestik/interdomestik',
        PR_FINALIZER_SKIP_CHECK_POLLING: 'false',
        PR_FINALIZER_MAX_CHECK_RETRIES: '2',
        PR_COUNTER: prCounter,
        CHECK_COUNTER: checkCounter,
        STALE_MARKER: marker,
      }),
    });
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /stale event head/u);
    assert.equal(fs.existsSync(marker), false);
    assert.equal(fs.readFileSync(prCounter, 'utf8'), '2');
    assert.equal(fs.readFileSync(checkCounter, 'utf8'), '1');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});
