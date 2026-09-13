import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { validRefresh } from './pr-feedback-refresh-fixtures.mjs';

const moduleUrl = new URL('./pr-feedback-refresh.mjs', import.meta.url);
test('refresh decisions bind changed feedback to an exact native run, not an approval request', async () => {
  assert.ok(fs.existsSync(moduleUrl), 'bounded feedback refresh implementation is not present');
  const { planRefresh } = await import(moduleUrl);
  const fixture = validRefresh();
  assert.deepEqual(planRefresh(fixture), { runId: 100, runAttempt: 1, context: 'delivery-gate' });
  fixture.run.event = 'pull_request_review';
  assert.equal(planRefresh(fixture), null);
});

for (const [name, mutate] of [
  [
    'unchanged feedback',
    f => {
      f.feedback.digest = 'a'.repeat(64);
    },
  ],
  [
    'fork',
    f => {
      f.pull.head.repo.id = 90;
    },
  ],
  [
    'closed PR',
    f => {
      f.pull.state = 'closed';
    },
  ],
  [
    'draft',
    f => {
      f.pull.draft = true;
    },
  ],
  [
    'missing draft',
    f => {
      delete f.pull.draft;
    },
  ],
  [
    'another base branch',
    f => {
      f.pull.base.ref = 'release';
    },
  ],
  [
    'different PR number',
    f => {
      f.feedback.number = 18;
    },
  ],
  [
    'stale base',
    f => {
      f.pull.base.sha = '4'.repeat(40);
    },
  ],
  [
    'stale head',
    f => {
      f.pull.head.sha = '4'.repeat(40);
    },
  ],
  [
    'stale merge',
    f => {
      f.pull.merge_commit_sha = '4'.repeat(40);
    },
  ],
  [
    'wrong workflow',
    f => {
      f.run.workflow_id = 21;
    },
  ],
  [
    'disabled workflow',
    f => {
      f.workflow.state = 'disabled_manually';
    },
  ],
  [
    'another script',
    f => {
      f.run.path = '.github/workflows/ci.yml';
    },
  ],
  [
    'bot origin',
    f => {
      f.run.actor.type = 'Bot';
    },
  ],
  [
    'read-only actor',
    f => {
      f.permission.permission = 'read';
    },
  ],
  [
    'identity mismatch',
    f => {
      f.permission.user.id = 8;
    },
  ],
  [
    'approval required',
    f => {
      f.run.conclusion = 'action_required';
    },
  ],
  [
    'in flight',
    f => {
      f.run.status = 'in_progress';
    },
  ],
  [
    'jobless',
    f => {
      f.jobs = [];
    },
  ],
  [
    'unmarked',
    f => {
      f.jobs[0].steps.shift();
    },
  ],
  [
    'skipped marker',
    f => {
      f.jobs[0].steps[0].conclusion = 'skipped';
    },
  ],
  [
    'skipped gate',
    f => {
      f.jobs[0].steps[1].conclusion = 'skipped';
    },
  ],
  [
    'marker after validation',
    f => {
      f.jobs[0].steps[0].number = 6;
    },
  ],
  [
    'additional job',
    f => {
      f.jobs.push(structuredClone(f.jobs[0]));
    },
  ],
  [
    'stale attempt',
    f => {
      f.jobs[0].run_attempt = 2;
    },
  ],
  [
    'attempt limit',
    f => {
      f.run.run_attempt = 50;
    },
  ],
  [
    'expired run',
    f => {
      f.run.created_at = '2026-08-01T12:00:00Z';
    },
  ],
  [
    'missing time',
    f => {
      delete f.run.created_at;
    },
  ],
  [
    'unsafe actor login',
    f => {
      f.run.actor.login = '../other';
    },
  ],
  [
    'foreign repository',
    f => {
      f.run.repository.id = 9;
    },
  ],
  [
    'foreign association',
    f => {
      f.run.pull_requests = [{ number: 18 }];
    },
  ],
]) {
  test(`refresh refuses ${name} without proposing a remote write`, async () => {
    assert.ok(fs.existsSync(moduleUrl), 'bounded feedback refresh implementation is not present');
    const { planRefresh } = await import(moduleUrl);
    const fixture = validRefresh();
    mutate(fixture);
    assert.equal(planRefresh(fixture), null);
  });
}

test('changed feedback can refresh a genuine failure but identical failed input cannot loop', async () => {
  assert.ok(fs.existsSync(moduleUrl), 'bounded feedback refresh implementation is not present');
  const { planRefresh } = await import(moduleUrl);
  const fixture = validRefresh();
  fixture.run.conclusion = 'failure';
  fixture.jobs[0].steps[1].conclusion = 'failure';
  assert.equal(planRefresh(fixture)?.runId, 100);
  fixture.feedback.digest = 'a'.repeat(64);
  assert.equal(planRefresh(fixture), null);
});
