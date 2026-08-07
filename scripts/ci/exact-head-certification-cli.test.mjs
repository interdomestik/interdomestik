import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

function run(event, policy = {}) {
  const directory = mkdtempSync(path.join(os.tmpdir(), 'exact-head-certification-'));
  const eventPath = path.join(directory, 'event.json');
  writeFileSync(eventPath, JSON.stringify(event));
  const result = spawnSync(process.execPath, ['scripts/ci/exact-head-certification.mjs'], {
    encoding: 'utf8',
    env: {
      ...process.env,
      GITHUB_EVENT_NAME: 'pull_request',
      GITHUB_EVENT_PATH: eventPath,
      GITHUB_RUN_ATTEMPT: '1',
      RUNNER_TEMP: directory,
      POLICY_SHOULD_RUN: 'true',
      POLICY_RUN_FULL: 'true',
      POLICY_FORCE_FULL: 'false',
      POLICY_REASON: 'pull-request-ready',
      ...policy,
    },
  });
  rmSync(directory, { recursive: true, force: true });
  return result;
}

function pullRequestEvent(overrides = {}) {
  return {
    action: 'synchronize',
    repository: { full_name: 'interdomestik/interdomestik' },
    pull_request: {
      draft: false,
      head: { repo: { full_name: 'interdomestik/interdomestik' } },
    },
    ...overrides,
  };
}

test('CLI emits fail-closed outputs for a later ready-head commit', () => {
  const result = run(pullRequestEvent());
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^run_broad=false$/mu);
  assert.match(result.stdout, /^certification_required=true$/mu);
  assert.match(result.stdout, /^consume_full_gate=false$/mu);
});

test('CLI admits and consumes a same-repository full-gate event', () => {
  const result = run(pullRequestEvent({ action: 'labeled', label: { name: 'full-gate' } }), {
    POLICY_FORCE_FULL: 'true',
    POLICY_REASON: 'full-gate-label',
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^run_broad=true$/mu);
  assert.match(result.stdout, /^consume_full_gate=true$/mu);
});

test('CLI fails closed when an unrelated label targets a ready head', () => {
  const result = run(pullRequestEvent({ action: 'labeled', label: { name: 'documentation' } }));
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^run_broad=false$/mu);
  assert.match(result.stdout, /^certification_required=true$/mu);
  assert.match(result.stdout, /^certification_reason=exact-head-certification-required$/mu);
});

test('CLI accepts the composite action policy JSON contract', () => {
  const result = run(pullRequestEvent(), {
    POLICY_JSON: JSON.stringify({
      should_run: 'true',
      run_full: 'true',
      force_full: 'false',
      reason: 'pull-request-ready',
    }),
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^certification_required=true$/mu);
});

test('CLI rejects malformed policy evidence', () => {
  const result = run(pullRequestEvent(), { POLICY_SHOULD_RUN: '' });
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /POLICY_SHOULD_RUN must be true or false/u);
});

test('CLI fails closed for a replayed lightweight workflow run', () => {
  const result = run(
    pullRequestEvent({
      pull_request: {
        draft: true,
        head: { repo: { full_name: 'interdomestik/interdomestik' } },
      },
    }),
    {
      GITHUB_RUN_ATTEMPT: '2',
      POLICY_RUN_FULL: 'false',
      POLICY_REASON: 'ordinary-draft',
    }
  );
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /^certification_required=true$/mu);
  assert.match(result.stdout, /^certification_reason=workflow-rerun-certification-required$/mu);
});
