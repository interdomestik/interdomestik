#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { evaluateValidationSurface } from './validation-surface-policy-lib.mjs';
import {
  evaluateDeliveryChecks,
  validateDeliveryContract,
  verifyCommitGraph,
  verifyFeedback,
} from '../github-pr-governance-report.mjs';

export { validateDeliveryContract };
const sleep = milliseconds => new Promise(resolve => setTimeout(resolve, milliseconds));

function fail(message, waiting = false) {
  throw new Error(`${waiting ? 'WAIT: ' : ''}${message}`);
}

export function evaluateDeliverySnapshot(contractInput, snapshot) {
  const contract = validateDeliveryContract(contractInput);
  const testedTree = verifyCommitGraph(snapshot);
  const selected = evaluateDeliveryChecks(contract, snapshot);
  verifyFeedback(contract, snapshot.feedback, snapshot.expected.head);
  return { ok: true, head: snapshot.expected.head, testedTree, selected };
}

class GitHubClient {
  constructor(repository, token, fetchImpl = fetch) {
    this.repository = repository;
    this.token = token;
    this.fetch = fetchImpl;
    this.jobCache = new Map();
  }

  async request(endpoint, options = {}) {
    const response = await this.fetch(`https://api.github.com/${endpoint}`, {
      ...options,
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${this.token}`,
        'X-GitHub-Api-Version': '2022-11-28',
        ...options.headers,
      },
    });
    if (!response.ok) fail(`GitHub API ${endpoint} returned ${response.status}`);
    return response.json();
  }

  async pages(endpoint, key = null) {
    const values = [];
    for (let page = 1; ; page += 1) {
      const separator = endpoint.includes('?') ? '&' : '?';
      const payload = await this.request(`${endpoint}${separator}per_page=100&page=${page}`);
      const batch = key ? payload[key] : payload;
      if (!Array.isArray(batch)) fail(`GitHub pagination mismatch for ${endpoint}`);
      values.push(...batch);
      if (batch.length < 100) return values;
    }
  }

  async graphql(query, variables) {
    const payload = await this.request('graphql', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query, variables }),
    });
    if (payload.errors?.length) fail(`GitHub GraphQL error: ${payload.errors[0].message}`);
    return payload.data;
  }

  async runIdentity(check) {
    if (check.app.id !== 15368) return { runId: check.id, runAttempt: 1 };
    if (this.jobCache.has(check.id)) return this.jobCache.get(check.id);
    const jobId = /\/job\/(\d+)/u.exec(check.details_url ?? '')?.[1];
    if (!jobId) fail(`GitHub Actions job identity missing for ${check.name}`);
    const job = await this.request(`repos/${this.repository}/actions/jobs/${jobId}`);
    const identity = { runId: job.run_id, runAttempt: job.run_attempt };
    this.jobCache.set(check.id, identity);
    return identity;
  }
}

async function collectChecks(client, head, contract) {
  const rawChecks = await client.pages(
    `repos/${client.repository}/commits/${head}/check-runs?filter=all`,
    'check_runs'
  );
  const rawStatuses = await client.pages(`repos/${client.repository}/commits/${head}/statuses`);
  const declared = new Map(contract.deliveryPrerequisites.map(item => [item.context, item.appId]));
  const checks = [];
  for (const item of rawChecks) {
    if (!declared.has(item.name) && !contract.generatorAppIds.includes(item.app.id)) continue;
    const identity = await client.runIdentity(item);
    const annotations =
      declared.get(item.name) === item.app.id
        ? await client.pages(`repos/${client.repository}/check-runs/${item.id}/annotations`)
        : [];
    checks.push({
      id: item.id,
      context: item.name,
      appId: item.app.id,
      headSha: item.head_sha,
      status: item.status,
      conclusion: item.conclusion,
      ...identity,
      annotations: annotations.map(annotation => ({
        level: annotation.annotation_level,
        message: annotation.message,
      })),
    });
  }
  for (const item of rawStatuses) {
    if (!declared.has(item.context)) continue;
    checks.push({
      id: item.id,
      context: item.context,
      appId: 0,
      headSha: item.sha,
      status: 'completed',
      conclusion: item.state,
      runId: item.id,
      runAttempt: 1,
      annotations: [],
    });
  }
  return checks;
}

async function collectThreads(client, number) {
  const [owner, name] = client.repository.split('/');
  const nodes = [];
  let cursor = null;
  do {
    const data = await client.graphql(
      `query($owner:String!,$name:String!,$number:Int!,$cursor:String){repository(owner:$owner,name:$name){pullRequest(number:$number){reviewThreads(first:100,after:$cursor){pageInfo{hasNextPage endCursor}nodes{isResolved comments(first:100){nodes{url author{login}}}}}}}}`,
      { owner, name, number, cursor }
    );
    const page = data.repository.pullRequest.reviewThreads;
    nodes.push(...page.nodes);
    cursor = page.pageInfo.hasNextPage ? page.pageInfo.endCursor : null;
  } while (cursor);
  return nodes;
}

async function collectFeedback(client, pull) {
  const base = `repos/${client.repository}`;
  const [reviews, issueComments, reviewComments, threads] = await Promise.all([
    client.pages(`${base}/pulls/${pull.number}/reviews`),
    client.pages(`${base}/issues/${pull.number}/comments`),
    client.pages(`${base}/pulls/${pull.number}/comments`),
    collectThreads(client, pull.number),
  ]);
  return {
    headSha: pull.head.sha,
    pagination: {
      checks: true,
      annotations: true,
      reviews: true,
      issueComments: true,
      reviewComments: true,
      threads: true,
    },
    unresolvedThreads: threads.filter(item => !item.isResolved),
    pendingReviewers: [
      ...(pull.requested_reviewers ?? []).map(item => item.login),
      ...(pull.requested_teams ?? []).map(item => item.slug),
    ],
    reviews: reviews.map(item => ({
      author: item.user?.login ?? '',
      commitId: item.commit_id ?? '',
      state: item.state ?? '',
      body: item.body ?? '',
      submittedAt: item.submitted_at ?? '',
    })),
    issueComments: issueComments.map(item => ({
      author: item.user?.login ?? '',
      body: item.body ?? '',
      createdAt: item.created_at ?? '',
    })),
    reviewComments: reviewComments.map(item => ({
      author: item.user?.login ?? '',
      commitId: item.commit_id ?? '',
      body: item.body ?? '',
    })),
  };
}

async function commit(client, sha) {
  const value = await client.request(`repos/${client.repository}/git/commits/${sha}`);
  return { tree: value.tree.sha, parents: value.parents.map(item => item.sha) };
}

async function collectSnapshot(client, contract, expected, number) {
  const pull = await client.request(`repos/${client.repository}/pulls/${number}`);
  const files = await client.pages(`repos/${client.repository}/pulls/${number}/files`);
  const [checks, feedback, base, head, testedMerge] = await Promise.all([
    collectChecks(client, expected.head, contract),
    collectFeedback(client, pull),
    commit(client, expected.base),
    commit(client, expected.head),
    commit(client, expected.testedMerge),
  ]);
  const changedFiles = files.map(item => item.filename);
  const packageJsonSurface = changedFiles.includes('package.json')
    ? { isNonProductOnly: false }
    : null;
  return {
    expected,
    pull: { state: pull.state, baseSha: pull.base.sha, headSha: pull.head.sha },
    commits: { [expected.base]: base, [expected.head]: head, [expected.testedMerge]: testedMerge },
    validationSurface: evaluateValidationSurface({
      eventName: 'pull_request',
      changedFiles,
      packageJsonSurface,
    }),
    checks,
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
    const expected = {
      base: argument('base', process.env.EXPECTED_BASE_SHA),
      head: argument('head', process.env.EXPECTED_HEAD_SHA),
      testedMerge: argument('tested-merge', process.env.EXPECTED_TESTED_MERGE_SHA),
    };
    const token = process.env.GITHUB_TOKEN ?? process.env.GH_TOKEN ?? '';
    const maxAttempts = Number(argument('max-attempts', '360'));
    const pollMs = Number(argument('poll-ms', '15000'));
    if (
      repository !== contract.repository ||
      !Number.isSafeInteger(number) ||
      number <= 0 ||
      !token
    ) {
      fail('runtime input mismatch');
    }
    const client = new GitHubClient(repository, token);
    let firstDigest = '';
    for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
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
        await sleep(contract.quiescenceMs);
      } catch (error) {
        if (!error.message.startsWith('WAIT:')) throw error;
        firstDigest = '';
        if (attempt === maxAttempts) throw error;
        process.stderr.write(`[delivery-gate] ${error.message}\n`);
        await sleep(pollMs);
      }
    }
    fail('delivery gate exhausted attempts');
  } catch (error) {
    process.stderr.write(`delivery gate failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) await main();
