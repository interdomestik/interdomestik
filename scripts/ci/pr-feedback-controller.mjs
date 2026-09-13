import { isDirectInvocation } from './pr-delivery-api.mjs';
import { createRefreshClient } from './pr-feedback-budget.mjs';
import {
  eligiblePull,
  isDeferredLabel,
  parseFeedbackMarker,
  planRefresh,
} from './pr-feedback-refresh.mjs';
import { captureFeedback } from './pr-feedback-snapshot.mjs';

const REPOSITORY = 'interdomestik/interdomestik';
const WORKFLOW_FILES = ['pr-finalizer.yml', 'pr-delivery-gate.yml'];
const RUN_SELECTION_LIMIT = 20;
const INCOMPLETE_SELECTION = 'refresh run selection incomplete; native source refresh required';

async function completePages(client, endpoint, key) {
  const result = await client.pages(endpoint, key);
  if (!result.complete) throw new Error('refresh pagination incomplete');
  return result.values;
}

async function latestAuthoritative(client, pull, workflow) {
  const prefix = `repos/${REPOSITORY}`;
  const runs = await completePages(
    client,
    `${prefix}/actions/workflows/${workflow.id}/runs?event=pull_request&head_sha=${pull.head.sha}`,
    'workflow_runs'
  );
  for (const summary of runs.sort((a, b) => b.id - a.id).slice(0, RUN_SELECTION_LIMIT)) {
    if (!Number.isSafeInteger(summary?.id) || summary.id < 1) return null;
    const run = await client.request(`${prefix}/actions/runs/${summary.id}`);
    if (run.id !== summary.id) return null;
    if (run.status !== 'completed' || !Number.isSafeInteger(run.run_attempt) || run.run_attempt < 1)
      return run;
    const jobs = await completePages(
      client,
      `${prefix}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,
      'jobs'
    );
    if (!isDeferredLabel(pull, workflow, run, jobs)) return run;
  }
  if (runs.length > RUN_SELECTION_LIMIT) throw new Error(INCOMPLETE_SELECTION);
  return null;
}

async function inspect(client, number, workflow, now) {
  const prefix = `repos/${REPOSITORY}`;
  const pull = await client.request(`${prefix}/pulls/${number}`);
  if (!eligiblePull(pull) || pull.number !== number) return null;
  if (!Number.isSafeInteger(workflow?.id) || workflow.id < 1)
    throw new Error('invalid refresh workflow');
  const run = await latestAuthoritative(client, pull, workflow);
  if (
    run?.status !== 'completed' ||
    !['success', 'failure'].includes(run.conclusion) ||
    !Number.isSafeInteger(run.run_attempt) ||
    run.run_attempt < 1 ||
    run.run_attempt >= 50 ||
    run.actor?.type !== 'User' ||
    !/^[a-z0-9-]{1,39}$/iu.test(run.actor.login)
  )
    return null;
  const jobs = await completePages(
    client,
    `${prefix}/actions/runs/${run.id}/attempts/${run.run_attempt}/jobs`,
    'jobs'
  );
  if (jobs.length !== 1 || !jobs[0].steps?.some(step => parseFeedbackMarker(step.name)))
    return null;
  const permission = await client.request(`${prefix}/collaborators/${run.actor.login}/permission`);
  const feedback = await captureFeedback(client, number, {
    base: pull.base.sha,
    head: pull.head.sha,
    testedMerge: pull.merge_commit_sha,
  });
  const evidence = { pull, workflow, run, jobs, permission, feedback, now };
  const plan = planRefresh(evidence);
  return plan ? { plan, digest: feedback.digest, evidence } : null;
}

async function stillCurrent(client, current, now) {
  const { run, pull, workflow, jobs, feedback } = current.evidence;
  const prefix = `repos/${REPOSITORY}`;
  const [freshPull, freshWorkflow, permission] = await Promise.all([
    client.request(`${prefix}/pulls/${pull.number}`),
    client.request(`${prefix}/actions/workflows/${workflow.id}`),
    client.request(`${prefix}/collaborators/${run.actor.login}/permission`),
  ]);
  if (!eligiblePull(freshPull)) return false;
  const latest = await latestAuthoritative(client, freshPull, freshWorkflow);
  if (latest?.id !== run.id) return false;
  const plan = planRefresh({
    pull: freshPull,
    run: latest,
    workflow: freshWorkflow,
    jobs,
    feedback,
    permission,
    now,
  });
  return JSON.stringify(plan) === JSON.stringify(current.plan);
}

export async function refreshOne(
  client,
  number,
  workflow,
  { now = Date.now(), apply = false } = {}
) {
  if (client.repository !== REPOSITORY || !Number.isSafeInteger(number) || number < 1)
    throw new Error('refresh runtime mismatch');
  const first = await inspect(client, number, workflow, now);
  if (!first) return { status: 'no-refresh' };
  if (!apply) return { status: 'would-refresh', ...first.plan };
  // Re-read every mutable selection input; no cache may authorize the POST.
  const current = await inspect(client, number, workflow, now);
  if (!current || JSON.stringify(first) !== JSON.stringify(current))
    return { status: 'selection-changed' };
  if (!(await stillCurrent(client, current, now))) return { status: 'selection-changed' };
  // This is the only write. Never approve a workflow or manufacture a check result.
  // A transport error is surfaced, not retried: the server may have accepted it.
  await client.response(`repos/${REPOSITORY}/actions/runs/${current.plan.runId}/rerun`, {
    method: 'POST',
  });
  return { status: 'refresh-requested', ...current.plan };
}

export function validateControllerEnvironment(env) {
  if (
    env.GITHUB_REPOSITORY !== REPOSITORY ||
    env.GITHUB_REPOSITORY_ID !== '1128472973' ||
    env.GITHUB_REF !== 'refs/heads/main' ||
    !['schedule', 'workflow_dispatch'].includes(env.GITHUB_EVENT_NAME) ||
    env.GITHUB_WORKFLOW_REF !==
      `${REPOSITORY}/.github/workflows/pr-feedback-refresh.yml@refs/heads/main` ||
    !/^[a-f0-9]{40}$/u.test(env.GITHUB_SHA) ||
    env.GITHUB_SHA !== env.GITHUB_WORKFLOW_SHA ||
    !env.GITHUB_TOKEN ||
    !['true', 'false'].includes(env.REFRESH_APPLY)
  )
    throw new Error('trusted refresh runtime mismatch');
  return env.REFRESH_APPLY === 'true';
}

async function openPullNumbers(client) {
  const numbers = new Set();
  const cursors = new Set();
  let cursor = null;
  for (let page = 0; page < 100; page++) {
    const data = await client.graphql(
      `query($cursor:String) { repository(owner:"interdomestik",name:"interdomestik") {
        pullRequests(first:100,after:$cursor,states:OPEN,baseRefName:"main") {
          nodes { number } pageInfo { hasNextPage endCursor }
        }
      } }`,
      { cursor }
    );
    const pulls = data?.repository?.pullRequests;
    if (
      !Array.isArray(pulls?.nodes) ||
      pulls.nodes.length > 100 ||
      typeof pulls.pageInfo?.hasNextPage !== 'boolean'
    )
      throw new Error('refresh inventory malformed');
    for (const item of pulls.nodes) {
      if (!Number.isSafeInteger(item?.number) || item.number < 1 || numbers.has(item.number))
        throw new Error('refresh inventory PR identity invalid or repeated');
      numbers.add(item.number);
    }
    if (!pulls.pageInfo.hasNextPage) return [...numbers];
    cursor = pulls.pageInfo.endCursor;
    if (typeof cursor !== 'string' || !cursor || cursors.has(cursor))
      throw new Error('refresh inventory cursor missing or repeated');
    cursors.add(cursor);
  }
  throw new Error('refresh inventory bound exceeded; action required');
}

export async function refreshRepository(
  client,
  { apply = false, report = () => {}, now = Date.now() } = {}
) {
  if (client.repository !== REPOSITORY) throw new Error('refresh runtime mismatch');
  // Complete the bounded inventory before any mutation; never silently process a partial list.
  let numbers;
  try {
    numbers = await openPullNumbers(client);
  } catch (error) {
    if (!client.budget?.reason) throw error;
    report({ status: 'deferred-budget', reason: client.budget.reason, scope: 'inventory' });
    return { failed: 0, deferred: 1 };
  }
  const workflows = await Promise.all(
    WORKFLOW_FILES.map(async file => {
      try {
        return await client.request(`repos/${REPOSITORY}/actions/workflows/${file}`);
      } catch {
        return null;
      }
    })
  );
  let failed = 0;
  let deferred = 0;
  // Rotate pairs, not just PRs: neither workflow may starve at a quota boundary.
  const pairs = numbers
    .sort((a, b) => a - b)
    .flatMap(number => workflows.map((workflow, index) => ({ number, workflow, index })));
  const offset = Math.floor(now / 300_000) % pairs.length;
  for (let position = 0; position < pairs.length; position++) {
    if (client.budget?.reason) {
      deferred += pairs.length - position;
      report({
        status: 'deferred-budget',
        reason: client.budget.reason,
        remainingPairs: pairs.length - position,
      });
      break;
    }
    const { number, workflow, index } = pairs[(offset + position) % pairs.length];
    let result;
    try {
      if (!workflow) throw new Error('workflow metadata unavailable');
      result = await refreshOne(client, number, workflow, { apply, now });
    } catch (error) {
      // Do not echo remote error bodies or retry a potentially accepted POST.
      if (client.budget?.reason) {
        deferred++;
        result = { status: 'deferred-budget', reason: client.budget.reason };
      } else {
        failed++;
        result = {
          status: 'refresh-failed',
          reason:
            error.message === INCOMPLETE_SELECTION
              ? INCOMPLETE_SELECTION
              : 'inspection or dispatch failed',
        };
      }
    }
    report({ number, workflow: WORKFLOW_FILES[index], ...result });
  }
  return { failed, deferred };
}

async function main() {
  const apply = validateControllerEnvironment(process.env);
  const client = createRefreshClient(process.env.GITHUB_TOKEN);
  const result = await refreshRepository(client, {
    apply,
    report: item => process.stdout.write(`${JSON.stringify(item)}\n`),
  });
  if (result.failed) process.exitCode = 1;
}

if (isDirectInvocation(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`feedback refresh failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
