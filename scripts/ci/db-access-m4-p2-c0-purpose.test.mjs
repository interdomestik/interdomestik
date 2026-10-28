import assert from 'node:assert/strict';
import test from 'node:test';
import { verifyOrdinaryProvenance, verifyM4C0UnitProvenance } from './p2/ordinary-provenance.mjs';
import {
  artifactFixture,
  bootstrapFixture,
  dispatchFixture,
  readCI,
} from './db-access-m4-p2-c0-purpose.fixture.mjs';
const context = {
  eventName: 'pull_request',
  headCommit: 'a'.repeat(40),
  candidateCommit: 'b'.repeat(40),
};
const input = {
  context,
  runId: 1,
  attempt: 2,
  run: {
    id: 1,
    run_attempt: 2,
    event: 'pull_request',
    status: 'completed',
    conclusion: 'failure',
    path: '.github/workflows/ci.yml',
    repository: { full_name: 'interdomestik/interdomestik' },
    head_repository: { full_name: 'interdomestik/interdomestik' },
    head_sha: context.headCommit,
    run_started_at: '2026-10-27T00:00:00Z',
  },
  job: { run_id: 1, run_attempt: 2, name: 'unit', status: 'completed', conclusion: 'success' },
  artifact: {
    id: 3,
    name: 'ordinary-coverage-2-' + context.candidateCommit,
    expired: false,
    workflow_run: { id: 1, head_sha: context.headCommit },
    digest: 'sha256:' + 'c'.repeat(64),
    size_in_bytes: 10,
    created_at: '2026-10-27T00:01:00Z',
  },
};
test('strict public predicate keeps completed failure refused despite caller purpose flags', () => {
  assert.throws(() => verifyOrdinaryProvenance({ ...input, m4C0: true, purpose: 'm4-c0' }));
  const good = structuredClone(input);
  good.run.conclusion = 'success';
  assert.equal(verifyOrdinaryProvenance(good).artifactId, 3);
});
test('C0 accepts terminal successful-unit coverage without certifying other CI failures', () => {
  assert.equal(verifyM4C0UnitProvenance(input).artifactId, 3);
  for (const value of [
    'cancelled',
    'timed_out',
    'neutral',
    'skipped',
    'action_required',
    'unknown',
  ]) {
    const x = structuredClone(input);
    x.run.conclusion = value;
    assert.throws(() => verifyM4C0UnitProvenance(x));
  }
});
test('C0 retains unit,attempt,event,source,artifact,expiry,digest and freshness refusals', () => {
  for (const mutate of [
    x => (x.run.status = 'in_progress'),
    x => (x.job.status = 'in_progress'),
    x => (x.job.conclusion = 'skipped'),
    x => (x.job.conclusion = 'cancelled'),
    x => (x.job.conclusion = 'failure'),
    x => (x.job.run_attempt = 1),
    x => (x.run.event = 'push'),
    x => (x.run.repository.full_name = 'foreign'),
    x => (x.run.head_sha = 'd'.repeat(40)),
    x => (x.artifact.name = 'old'),
    x => (x.artifact.expired = true),
    x => (x.artifact.digest = 'bad'),
    x => (x.artifact.created_at = '2026-10-26T00:00:00Z'),
  ]) {
    const x = structuredClone(input);
    mutate(x);
    assert.throws(() => verifyM4C0UnitProvenance(x));
  }
});
test('private invocation purpose cannot be DTO/env-created or crossed; artifact authority is context bound one-use', () => {
  const b = bootstrapFixture();
  assert.throws(() => b.takeM4C0BootstrapInvocation({ context, purpose: 'm4-c0' }));
  const o = { context };
  b.seedInvocation(o, 'm4-c0');
  assert.throws(() => b.takeP2BootstrapInvocation(o));
  const state = b.takeM4C0BootstrapInvocation(o);
  assert.throws(() => b.takeM4C0BootstrapInvocation(o));
  for (const copy of [{}, structuredClone(state.artifactAuthority)])
    assert.throws(() => b.consumeM4C0ArtifactAuthority(copy, context));
  assert.throws(() =>
    b.consumeM4C0ArtifactAuthority(state.artifactAuthority, { ...context, headCommit: 'foreign' })
  );
  b.consumeM4C0ArtifactAuthority(state.artifactAuthority, context);
  assert.throws(() => b.consumeM4C0ArtifactAuthority(state.artifactAuthority, context));
});
test('bootstrap required and C0 takes refuse opposite purpose, clones and replay', () => {
  for (const purpose of ['required', 'm4-c0']) {
    const b = bootstrapFixture(),
      r = {};
    b.seedResult(r, purpose, context);
    const correct =
      purpose === 'required'
        ? b.takeBootstrappedP2CoverageForJoin
        : b.takeBootstrappedM4C0CoverageForJoin;
    const wrong =
      purpose === 'required'
        ? b.takeBootstrappedM4C0CoverageForJoin
        : b.takeBootstrappedP2CoverageForJoin;
    assert.throws(() => wrong(r, context));
    assert.throws(() => correct(structuredClone(r), context));
    assert.equal(correct(r, context).purpose, purpose);
    assert.throws(() => correct(r, context));
  }
});
test('dispatch required and C0 result takes enforce the same private purpose and freshness', () => {
  const d = dispatchFixture(context);
  for (const purpose of ['required', 'm4-c0']) {
    const r = {};
    d.seed(r, purpose);
    const correct =
        purpose === 'required' ? d.takeFreshP2CoverageForJoin : d.takeFreshM4C0CoverageForJoin,
      wrong =
        purpose === 'required' ? d.takeFreshM4C0CoverageForJoin : d.takeFreshP2CoverageForJoin;
    assert.throws(() => wrong(r, context));
    assert.throws(() => correct({}, context));
    assert.equal(correct(r, context).nativeAdmission, false);
    assert.throws(() => correct(r, context));
  }
});
test('artifact dedicated fetch requires consumed private authority before any request', async () => {
  const b = bootstrapFixture();
  const a = artifactFixture({
    consumeM4C0ArtifactAuthority: b.consumeM4C0ArtifactAuthority,
  });
  await assert.rejects(a.fetchM4C0OrdinaryCoverageArtifact({ context, token: 'unit-double' }, {}));
});
test('exact76 closure, source-bound dedicated adapter and unchanged60percent gate', async () => {
  const { M4_P2_CLOSURE_FILES, assertM4P2ClosureNames } =
    await import('./db-access-m4-p2-closure.mjs');
  assert.equal(M4_P2_CLOSURE_FILES.length, 76);
  assertM4P2ClosureNames(M4_P2_CLOSURE_FILES);
  assert.throws(() =>
    assertM4P2ClosureNames(M4_P2_CLOSURE_FILES.filter(x => !x.endsWith('ordinary-provenance.mjs')))
  );
  const read = readCI;
  assert(read('db-access-m4-p2-ordinary.mjs').includes('bootstrap.runBootstrappedM4C0Coverage'));
  assert(read('db-access-m4-p2-ordinary.mjs').includes('takeBootstrappedM4C0CoverageForJoin'));
  assert(
    read('db-access-m4-p2-ordinary.mjs').includes('.github/actions/ordinary-pr-coverage/action.yml')
  );
  assert(read('p2/ordinary-dispatch.mjs').includes('minLinesPct: 60'));
  assert(read('p2/ordinary-dispatch.mjs').includes('workflowFailureNotDeliveryAccepted: true'));
  assert(
    read('p2/ordinary-artifact.mjs').includes(
      "location.hostname.endsWith('.blob.core.windows.net')"
    )
  );
});
