import fs from 'node:fs';

export const contract = JSON.parse(
  fs.readFileSync(new URL('./pr-delivery-contract.json', import.meta.url), 'utf8')
);
export const B = '1'.repeat(40);
export const H = '2'.repeat(40);
export const T = '3'.repeat(40);
export const TREE = '4'.repeat(40);

export const check = (context, appId, overrides = {}) => ({
  id: Number(`${appId}${context.length}`),
  context,
  appId,
  headSha: H,
  status: 'completed',
  conclusion: 'success',
  runId: Number(`${context.length}01`),
  runAttempt: 1,
  annotations: [],
  ...overrides,
});

export function checksFor(currentContract = contract) {
  return currentContract.deliveryPrerequisites
    .filter(item => item.requirement === 'required')
    .map(item => check(item.context, item.appId));
}

export function snapshot(overrides = {}) {
  return {
    expected: { base: B, head: H, testedMerge: T },
    pull: { state: 'open', baseSha: B, headSha: H },
    commits: {
      [B]: { tree: '5'.repeat(40), parents: [] },
      [H]: { tree: TREE, parents: [B] },
      [T]: { tree: TREE, parents: [B, H] },
    },
    validationSurface: { shouldRun: true, reason: 'runtime_sensitive_surface' },
    checks: checksFor(),
    feedback: {
      headSha: H,
      disposedReviewIds: [],
      pagination: {
        checks: true,
        annotations: true,
        reviews: true,
        issueComments: true,
        reviewComments: true,
        threads: true,
      },
      unresolvedThreads: [],
      pendingReviewers: [],
      reviews: [],
      issueComments: [],
      reviewComments: [],
    },
    ...overrides,
  };
}
