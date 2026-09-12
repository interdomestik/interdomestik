import fs from 'node:fs';
import { isDirectInvocation } from './pr-delivery-api.mjs';
import { GitHubCliClient } from './pr-delivery-cli.mjs';

const positiveId = value => Number.isSafeInteger(value) && value > 0;
const activeStatuses = new Set(['queued', 'in_progress', 'requested', 'waiting', 'pending']);
const replacementEvents = new Set([
  'pull_request',
  'pull_request_review',
  'pull_request_review_comment',
]);
const replacementActions = new Map([
  ['pull_request', new Set(['synchronize'])],
  ['pull_request_review', new Set(['submitted', 'edited', 'dismissed'])],
  ['pull_request_review_comment', new Set(['created', 'edited', 'deleted'])],
]);
const replacementRunNames = new Set(['PR delivery gate', 'PR finalizer']);

function isMarkedReplacementProducer(run, head) {
  const actions = replacementActions.get(run.event);
  if (!actions || typeof run.display_title !== 'string') return false;
  return [...replacementRunNames].some(name =>
    [...actions].some(
      action => run.display_title === `${name} [supersession:v1:${run.event}:${action}:${head}]`
    )
  );
}

export async function hasPendingCheckReplacement(client, check, head) {
  if (check.appId !== 15368) return false;
  if (
    client.repository !== 'interdomestik/interdomestik' ||
    !/^[a-f0-9]{40}$/u.test(head) ||
    check.headSha !== head ||
    !positiveId(check.runId) ||
    !positiveId(check.runAttempt)
  ) {
    throw new Error('replacement check identity mismatch');
  }
  const run = await client.cached(`producer:${check.runId}`, () =>
    client.request(`repos/${client.repository}/actions/runs/${check.runId}`)
  );
  if (
    run.id !== check.runId ||
    run.head_sha !== head ||
    !replacementEvents.has(run.event) ||
    !positiveId(run.workflow_id)
  ) {
    throw new Error('replacement producer identity mismatch');
  }
  const candidates = await client.pages(
    `repos/${client.repository}/actions/workflows/${run.workflow_id}/runs?head_sha=${head}`,
    'workflow_runs'
  );
  if (!candidates.complete) throw new Error('replacement workflow pagination incomplete');
  const latest = candidates.values
    .filter(
      candidate =>
        positiveId(candidate.id) &&
        positiveId(candidate.run_attempt) &&
        candidate.workflow_id === run.workflow_id &&
        candidate.head_sha === head &&
        replacementEvents.has(candidate.event) &&
        (candidate.id === check.runId ||
          (isMarkedReplacementProducer(run, head) && isMarkedReplacementProducer(candidate, head)))
    )
    .sort((left, right) => right.id - left.id || right.run_attempt - left.run_attempt)[0];
  return Boolean(
    latest &&
    activeStatuses.has(latest.status) &&
    (latest.id > check.runId ||
      (latest.id === check.runId && latest.run_attempt > check.runAttempt))
  );
}

async function main() {
  const [repository, head] = process.argv.slice(2);
  const input = fs.readFileSync(0, 'utf8');
  if (input.length > 262144) throw new Error('replacement check input exceeds bound');
  const checks = JSON.parse(input);
  if (!Array.isArray(checks) || checks.length !== 1)
    throw new Error('replacement check identity mismatch');
  const check = checks[0];
  const client = new GitHubCliClient(repository);
  const identity = await client.runIdentity(check);
  const pending = await hasPendingCheckReplacement(
    client,
    { appId: check.app?.id, headSha: check.head_sha, ...identity },
    head
  );
  process.stdout.write(`${pending}\n`);
}

if (isDirectInvocation(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`check replacement failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
