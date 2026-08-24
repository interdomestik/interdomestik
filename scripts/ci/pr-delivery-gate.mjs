#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';

import { DELIVERY_POLL_MS, GitHubClient, isDirectInvocation } from './pr-delivery-api.mjs';
import {
  evaluatePackageJsonValidationSurface,
  evaluateValidationSurface,
} from './validation-surface-policy-lib.mjs';
import { readTrustedRunnerFile } from './trusted-runner-file.mjs';
import {
  eventPullNumber,
  evaluateDeliveryChecks,
  validateDeliveryContract,
  verifyCommitGraph,
  verifyFeedback,
} from '../github-pr-governance-report.mjs';

export { eventPullNumber, validateDeliveryContract };
export { GitHubClient, trustedGitHubApiUrl } from './pr-delivery-api.mjs';
const MAX_ATTEMPTS = 175;
const MAX_PAGES = 100;
const wait = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function fail(message, waiting = false, retryAfterMs = DELIVERY_POLL_MS) {
  const error = new Error(`${waiting ? 'WAIT: ' : ''}${message}`);
  if (waiting) error.retryAfterMs = retryAfterMs;
  throw error;
}

export function evaluateDeliverySnapshot(contractInput, snapshot) {
  const contract = validateDeliveryContract(contractInput);
  const testedTree = verifyCommitGraph(snapshot);
  const selected = evaluateDeliveryChecks(contract, snapshot);
  verifyFeedback(contract, snapshot.feedback, snapshot.expected.head);
  return { ok: true, head: snapshot.expected.head, testedTree, selected };
}
async function collectChecks(client, head, contract) {
  const rawChecks = await client.pages(
    `repos/${client.repository}/commits/${head}/check-runs?filter=all`,
    'check_runs'
  );
  const declared = new Map(contract.deliveryPrerequisites.map(item => [item.context, item.appId]));
  const checks = [];
  let annotationsComplete = true;
  for (const item of rawChecks.values) {
    if (!declared.has(item.name)) continue;
    if (!Number.isSafeInteger(item.app?.id))
      fail(`GitHub check app identity missing for ${item.name}`);
    const identity = await client.runIdentity(item);
    let annotations = { values: [], complete: true };
    if (declared.get(item.name) === item.app.id && item.status === 'completed') {
      annotations = await client.cached(`annotations:${item.id}`, () =>
        client.pages(`repos/${client.repository}/check-runs/${item.id}/annotations`)
      );
    }
    annotationsComplete &&= annotations.complete;
    checks.push({
      id: item.id,
      context: item.name,
      appId: item.app.id,
      headSha: item.head_sha,
      status: item.status,
      conclusion: item.conclusion,
      ...identity,
      annotations: annotations.values.map(annotation => ({
        level: annotation.annotation_level,
        message: annotation.message,
      })),
    });
  }
  return { values: checks, complete: rawChecks.complete, annotationsComplete };
}
async function collectThreads(client, number) {
  const [owner, name] = client.repository.split('/');
  const nodes = [];
  let cursor = null;
  let complete = true;
  for (let pageNumber = 1; pageNumber <= MAX_PAGES; pageNumber += 1) {
    const data = await client.graphql(
      `query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){pageInfo{hasNextPage endCursor}nodes{isResolved comments(first:100){pageInfo{hasNextPage}nodes{url author{login}}}}}}}}`,
      { owner, name, number, cursor }
    );
    const page = data.repository.pullRequest.reviewThreads;
    nodes.push(...page.nodes);
    if (page.nodes.some(thread => thread.comments.pageInfo.hasNextPage)) complete = false;
    if (!page.pageInfo.hasNextPage) return { values: nodes, complete };
    cursor = page.pageInfo.endCursor;
    if (!cursor) fail('review-thread pagination cursor missing');
  }
  return { values: nodes, complete: false };
}
async function collectFeedback(client, pull) {
  const base = `repos/${client.repository}`;
  const [reviews, issueComments, reviewComments, threads] = await Promise.all([
    client.pages(`${base}/pulls/${pull.number}/reviews`),
    client.pages(`${base}/issues/${pull.number}/comments`),
    client.pages(`${base}/pulls/${pull.number}/comments`),
    collectThreads(client, pull.number),
  ]);
  const resolvedComments = new Set(
    threads.values
      .filter(thread => thread.isResolved)
      .flatMap(thread => thread.comments.nodes.map(comment => comment.url))
  );
  return {
    headSha: pull.head.sha,
    pagination: {
      checks: true,
      annotations: true,
      reviews: reviews.complete,
      issueComments: issueComments.complete,
      reviewComments: reviewComments.complete,
      threads: threads.complete,
    },
    unresolvedThreads: threads.values.filter(item => !item.isResolved),
    pendingReviewers: [
      ...(pull.requested_reviewers ?? []).map(item => item.login),
      ...(pull.requested_teams ?? []).map(item => item.slug),
    ],
    reviews: reviews.values.map(item => ({
      author: item.user?.login ?? '',
      commitId: item.commit_id ?? '',
      state: item.state ?? '',
      body: item.body ?? '',
      submittedAt: item.submitted_at ?? '',
    })),
    issueComments: issueComments.values.map(item => ({
      author: item.user?.login ?? '',
      body: item.body ?? '',
      createdAt: item.updated_at ?? item.created_at ?? '',
    })),
    reviewComments: reviewComments.values.map(item => ({
      author: item.user?.login ?? '',
      commitId: item.commit_id ?? '',
      body: item.body ?? '',
      createdAt: item.updated_at ?? item.created_at ?? '',
      resolved: resolvedComments.has(item.html_url),
    })),
  };
}

async function commit(client, sha) {
  const value = await client.cached(`commit:${sha}`, () =>
    client.request(`repos/${client.repository}/git/commits/${sha}`)
  );
  return { tree: value.tree.sha, parents: value.parents.map(item => item.sha) };
}

export async function resolvePackageJsonSurface(client, changedFiles, base, head) {
  if (!changedFiles.includes('package.json')) return null;
  const content = async sha => {
    const value = await client.cached(`package-json:${sha}`, () =>
      client.request(`repos/${client.repository}/contents/package.json?ref=${sha}`)
    );
    if (value.encoding !== 'base64' || typeof value.content !== 'string') {
      fail('package.json API content mismatch');
    }
    return Buffer.from(value.content.replaceAll('\n', ''), 'base64').toString('utf8');
  };
  return evaluatePackageJsonValidationSurface({
    beforeContent: await content(base),
    afterContent: await content(head),
  });
}

async function collectSnapshot(client, contract, expected, number) {
  const explicit = Object.values(expected).filter(Boolean).length;
  if (explicit !== 3) fail('incomplete expected identity');
  const bound = expected;
  const pull = await client.request(`repos/${client.repository}/pulls/${number}`);
  const files = await client.cached(`files:${bound.head}`, () =>
    client.pages(`repos/${client.repository}/pulls/${number}/files`)
  );
  if (!files.complete) fail('changed-file pagination incomplete');
  const [checks, feedback, base, head, testedMerge] = await Promise.all([
    collectChecks(client, bound.head, contract),
    collectFeedback(client, pull),
    commit(client, bound.base),
    commit(client, bound.head),
    commit(client, bound.testedMerge),
  ]);
  feedback.pagination.checks = checks.complete;
  feedback.pagination.annotations = checks.annotationsComplete;
  const changedFiles = files.values.map(item => item.filename);
  const packageSurface = await resolvePackageJsonSurface(
    client,
    changedFiles,
    bound.base,
    bound.head
  );
  return {
    expected: bound,
    pull: { state: pull.state, baseSha: pull.base.sha, headSha: pull.head.sha },
    commits: { [bound.base]: base, [bound.head]: head, [bound.testedMerge]: testedMerge },
    validationSurface: evaluateValidationSurface({
      eventName: 'pull_request',
      changedFiles,
      packageJsonSurface: packageSurface,
    }),
    checks: checks.values,
    feedback,
  };
}

function argument(name, fallback = '') {
  const prefix = `--${name}=`;
  return process.argv.find(item => item.startsWith(prefix))?.slice(prefix.length) ?? fallback;
}

async function main() {
  try {
    const contractPath = path.resolve(argument('contract', 'scripts/ci/pr-delivery-contract.json'));
    const contract = validateDeliveryContract(JSON.parse(fs.readFileSync(contractPath, 'utf8')));
    const repository = argument('repository', process.env.GITHUB_REPOSITORY);
    const number = Number(argument('pr', process.env.PR_NUMBER));
    const event = JSON.parse(readTrustedRunnerFile(process.env.GITHUB_EVENT_PATH));
    const expected = {
      base: argument('base', process.env.EXPECTED_BASE_SHA),
      head: argument('head', process.env.EXPECTED_HEAD_SHA),
      testedMerge: argument('tested-merge', process.env.EXPECTED_TESTED_MERGE_SHA),
    };
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
    if (
      repository !== contract.repository ||
      !Number.isSafeInteger(number) ||
      number <= 0 ||
      !event ||
      eventPullNumber(process.env.GITHUB_EVENT_NAME, event) !== number ||
      !token
    ) {
      fail('runtime input mismatch');
    }
    const client = new GitHubClient(repository, token);
    let firstDigest = '';
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
      try {
        const snapshot = await collectSnapshot(client, contract, expected, number);
        const result = evaluateDeliverySnapshot(contract, snapshot);
        const digest = JSON.stringify({
          head: result.head,
          selected: result.selected,
          feedback: snapshot.feedback,
        });
        if (firstDigest && firstDigest === digest) {
          process.stdout.write(`${JSON.stringify(result)}\n`);
          return;
        }
        firstDigest = digest;
        await wait(contract.quiescenceMs);
      } catch (error) {
        if (!error.message.startsWith('WAIT:')) throw error;
        firstDigest = '';
        if (attempt === MAX_ATTEMPTS) throw error;
        process.stderr.write(`[delivery-gate] ${error.message}\n`);
        await wait(error.retryAfterMs ?? DELIVERY_POLL_MS);
      }
    }
    fail('delivery gate exhausted attempts');
  } catch (error) {
    process.stderr.write(`delivery gate failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (isDirectInvocation(import.meta.url)) await main();
