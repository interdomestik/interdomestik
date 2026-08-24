import assert from 'node:assert/strict';
import test from 'node:test';

import {
  assertCurrentHead,
  buildReviewRequestPlan,
  flattenCommentPages,
  main,
  markerFor,
  promptBody,
  validateConfig,
} from './github-request-pr-reviewers.mjs';

const HEAD_A = 'a'.repeat(40);
const HEAD_B = 'b'.repeat(40);
const config = {
  botPrompts: [{ id: 'codex', body: '@codex review' }],
};

test('reviewer plan posts only missing current-head prompts', () => {
  const pr = {
    headRefOid: HEAD_A,
    comments: [{ body: markerFor('codex', HEAD_A) }],
  };

  const plan = buildReviewRequestPlan({ config, pr });

  assert.deepEqual(plan, { botPrompts: [] });
});

test('reviewer plan treats a new head as needing fresh Codex prompt', () => {
  const pr = {
    headRefOid: HEAD_B,
    comments: [{ body: markerFor('other', HEAD_A) }, { body: markerFor('codex', HEAD_A) }],
  };

  const plan = buildReviewRequestPlan({ config, pr });

  assert.deepEqual(
    plan.botPrompts.map(prompt => prompt.id),
    ['codex']
  );
  assert.deepEqual(Object.keys(plan), ['botPrompts']);
});

test('reviewer config is closed to the one allowlisted prompt', () => {
  assert.equal(validateConfig(config), config);
  for (const invalid of [
    null,
    {},
    { ...config, extra: true },
    { botPrompts: [] },
    { botPrompts: [{ id: 'other', body: '@codex review' }] },
    { botPrompts: [{ id: 'codex', body: '@codex do something else' }] },
    { botPrompts: [...config.botPrompts, ...config.botPrompts] },
    { botPrompts: [{ ...config.botPrompts[0], extra: true }] },
  ]) {
    assert.throws(
      () => validateConfig(invalid),
      /.github\/reviewer-routing.json.*allowlisted Codex prompt/u
    );
  }
});

test('reviewer mutation rejects a changed PR head', () => {
  const observed = { headRefOid: HEAD_A, number: 1, state: 'OPEN' };
  assert.doesNotThrow(() => assertCurrentHead(observed, observed));
  assert.throws(
    () => assertCurrentHead(observed, { ...observed, headRefOid: HEAD_B }),
    /head changed/u
  );
  assert.throws(
    () => assertCurrentHead({ ...observed, state: 'CLOSED' }, observed),
    /not open.*observed #1 CLOSED; current #1 OPEN/u
  );
  for (const pair of [
    [observed, { ...observed, state: 'CLOSED' }],
    [observed, { ...observed, number: 2 }],
  ]) {
    assert.throws(() => assertCurrentHead(...pair), /not open/u);
  }
  for (const invalid of [undefined, '', 'abc123', HEAD_A.toUpperCase(), `${'g'.repeat(40)}`]) {
    assert.throws(
      () => assertCurrentHead({ ...observed, headRefOid: invalid }, observed),
      /40-character SHA/u
    );
  }
});

test('prompt body keeps the mention first and embeds a current-head marker', () => {
  const body = promptBody({ id: 'codex', body: '@codex review' }, HEAD_A);

  assert.match(body, /^@codex review/u);
  assert.match(body, new RegExp(`interdomestik-reviewer-request:codex:${HEAD_A}`, 'u'));
});

test('comment pagination is complete and rejects malformed pages', () => {
  assert.deepEqual(flattenCommentPages([[{ body: 'first' }], [{ body: 'second' }]]), [
    { body: 'first' },
    { body: 'second' },
  ]);
  for (const malformed of [
    {},
    [{}],
    [[{ body: 'valid' }], {}],
    [[null]],
    [[{}]],
    [[{ body: 1 }]],
  ]) {
    assert.throws(() => flattenCommentPages(malformed), /unexpected shape/u);
  }
  assert.deepEqual(flattenCommentPages([[]]), []);
});

function pr(headRefOid = HEAD_A, comments = []) {
  return { comments, headRefOid, number: 17, state: 'OPEN' };
}

function depsFor(sequence, overrides = {}) {
  const reads = [...sequence];
  return {
    loadConfig: () => config,
    postComment: () => {},
    printPlan: () => {},
    readPr: () => {
      assert.ok(reads.length, 'unexpected PR read');
      return reads.shift();
    },
    ...overrides,
  };
}

test('main validates policy before any network read and dry-run never mutates', async () => {
  let reads = 0;
  await assert.rejects(
    main(['17'], {
      ...depsFor([]),
      loadConfig: () => ({ botPrompts: [] }),
      readPr: () => {
        reads += 1;
      },
    }),
    /allowlisted Codex prompt/u
  );
  assert.equal(reads, 0);

  let posts = 0;
  const result = await main(['--dry-run', '17'], depsFor([pr()], { postComment: () => posts++ }));
  assert.deepEqual(result, { head: HEAD_A, posted: [] });
  assert.equal(posts, 0);
});

test('main rejects a stale head before mutation and detects a race after mutation', async () => {
  let posts = 0;
  await assert.rejects(
    main(['17'], depsFor([pr(), pr(HEAD_B)], { postComment: () => posts++ })),
    /head changed/u
  );
  assert.equal(posts, 0);

  await assert.rejects(
    main(['17'], depsFor([pr(), pr(), pr(HEAD_B)], { postComment: () => posts++ })),
    /head changed/u
  );
  assert.equal(posts, 1);
});

test('main posts once for a stable head and reports the exact decision', async () => {
  const posted = [];
  const result = await main(
    ['17'],
    depsFor([pr(), pr(), pr()], { postComment: (_pr, prompt) => posted.push(prompt.id) })
  );

  assert.deepEqual(posted, ['codex']);
  assert.deepEqual(result, { head: HEAD_A, posted: ['codex'] });
});
