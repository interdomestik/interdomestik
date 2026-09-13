import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { GitHubClient, isDirectInvocation } from './pr-delivery-api.mjs';
import { collectFeedback, pendingReviewers } from './pr-delivery-feedback.mjs';
import { eligiblePull, sameFeedbackIdentity } from './pr-feedback-refresh.mjs';

const feedbackAuthors = new Set(
  JSON.parse(fs.readFileSync(new URL('./pr-delivery-contract.json', import.meta.url), 'utf8'))
    .feedbackAuthors
);

function issueAuthorIdentities(comments) {
  // generatorFeedback uses issue comments only for bot identity, not body or time.
  // Trusted human dispositions are already represented by disposedReviewIds.
  return [
    ...new Set(
      comments.flatMap(({ author }) => {
        const normalized = author.replace(/\[bot\]$/u, '').toLowerCase();
        return feedbackAuthors.has(normalized) ||
          author.endsWith('[bot]') ||
          normalized === 'copilot'
          ? [normalized]
          : [];
      })
    ),
  ];
}

// Feedback collections are sets: API ordering alone must not schedule another run.
function canonical(value) {
  if (Array.isArray(value))
    return value.map(canonical).sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)));
  if (value && typeof value === 'object')
    return Object.fromEntries(
      Object.keys(value)
        .sort((a, b) => {
          if (a < b) return -1;
          return a > b ? 1 : 0;
        })
        .map(key => [key, canonical(value[key])])
    );
  return value;
}

export async function captureFeedback(client, number, expected) {
  const endpoint = `repos/${client.repository}/pulls/${number}`;
  const identity = pull => ({
    number: pull.number,
    base: pull.base?.sha,
    head: pull.head?.sha,
    testedMerge: pull.merge_commit_sha,
  });
  const requireIdentity = pull => {
    if (!eligiblePull(pull) || !sameFeedbackIdentity(identity(pull), { number, ...expected })) {
      throw new Error('feedback source identity changed');
    }
  };
  const pull = await client.request(endpoint);
  requireIdentity(pull);
  const merge = await client.request(
    `repos/${client.repository}/git/commits/${expected.testedMerge}`
  );
  if (
    merge.parents?.length !== 2 ||
    merge.parents[0].sha !== expected.base ||
    merge.parents[1].sha !== expected.head
  ) {
    throw new Error('feedback merge identity mismatch');
  }
  const feedback = await collectFeedback(client, pull);
  if (Object.values(feedback.pagination).some(value => value !== true))
    throw new Error('feedback pagination incomplete');
  const finalPull = await client.request(endpoint);
  requireIdentity(finalPull);
  feedback.pendingReviewers = [
    ...new Set([...feedback.pendingReviewers, ...pendingReviewers(finalPull)]),
  ];
  feedback.issueComments = issueAuthorIdentities(feedback.issueComments);
  const bound = identity(finalPull);
  const digest = createHash('sha256')
    .update(JSON.stringify(canonical({ ...bound, feedback })))
    .digest('hex');
  return { ...bound, digest };
}

export async function recordFeedbackMarker(client, number, expected, publish) {
  const { base, head, testedMerge } = expected;
  const identity = { base, head, testedMerge };
  if (
    client.repository !== 'interdomestik/interdomestik' ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    !Object.values(identity).every(sha => typeof sha === 'string' && /^[a-f0-9]{40}$/u.test(sha))
  )
    throw new Error('feedback marker identity invalid');
  let digest = 'unavailable';
  try {
    ({ digest } = await captureFeedback(client, number, identity));
  } finally {
    // Missing feedback is explicit, never a fabricated digest or successful capture.
    publish(`feedback-snapshot:v1:${number}:${base}:${head}:${testedMerge}:${digest}`);
  }
}

async function main() {
  const { GITHUB_REPOSITORY: repository, GITHUB_TOKEN: token, GITHUB_OUTPUT: output } = process.env;
  const number = Number(process.env.PR_NUMBER);
  if (
    repository !== 'interdomestik/interdomestik' ||
    !Number.isSafeInteger(number) ||
    number < 1 ||
    !token ||
    !output
  ) {
    throw new Error('feedback capture runtime mismatch');
  }
  await recordFeedbackMarker(
    new GitHubClient(repository, token),
    number,
    {
      base: process.env.EXPECTED_BASE_SHA,
      head: process.env.EXPECTED_HEAD_SHA,
      testedMerge: process.env.EXPECTED_TESTED_MERGE_SHA,
    },
    marker => fs.appendFileSync(output, `marker=${marker}\n`)
  );
}

if (isDirectInvocation(import.meta.url)) {
  try {
    await main();
  } catch (error) {
    process.stderr.write(`feedback snapshot failed: ${error.message}\n`);
    process.exitCode = 1;
  }
}
