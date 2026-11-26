import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import yaml from 'js-yaml';
import { readContext } from './migration-phase/context.mjs';
import { verifyDeployment } from './migration-phase/deployment.mjs';
import { digest, verifyDrainReceipt, verifyGitHubApproval } from './migration-phase/proof.mjs';

const now = Date.parse('2026-11-26T12:00:00.000Z');
const commitSha = 'a'.repeat(40);
const imageDigest = `sha256:${'b'.repeat(64)}`;
const vercelOutputDigest = `sha256:${'c'.repeat(64)}`;
const repository = 'interdomestik/interdomestik';
const release = {
  manifest: {
    version: 1,
    repository,
    environment: 'staging',
    commitSha,
    runId: '123',
    imageDigest,
    plan: {
      backendMarkerSha256: '1'.repeat(64),
      journalSha256: '2'.repeat(64),
      expand: { tag: '0111_wp07_rate_check_expand', idx: 111, when: 123, hash: 'e'.repeat(64) },
      contract: { tag: '0112_wp07_rate_check_contract', idx: 112, when: 124, hash: 'f'.repeat(64) },
    },
  },
  deploymentId: 'dpl_123',
  hostname: 'interdomestik-immutable.vercel.app',
  deploymentAttempt: '1',
  vercelOutputDigest,
};
const invocation = { environment: 'staging-migration-contract', runId: '123', attempt: '2' };
const binding = {
  release,
  invocation,
  manifestSha256: digest(JSON.stringify(release.manifest)),
  now,
};
const fixture = () =>
  structuredClone({
    version: 1,
    release,
    invocation,
    manifestSha256: binding.manifestSha256,
    evidence: {
      id: 'ops/123',
      sha256: 'd'.repeat(64),
      fence: 'fence-123',
      writers: {
        webEndpoints: ['old-web'],
        workers: ['old-worker'],
        schedulers: [],
        queues: ['old-queue'],
      },
      outstandingWrites: 0,
      inFlightTransactions: 0,
      preparedTransactions: 0,
      observedAt: '2026-11-26T11:55:00.000Z',
      expiresAt: '2026-11-26T12:05:00.000Z',
    },
  });

test('refuses absent, empty, unparseable, valid-empty and oversized receipts', () => {
  for (const raw of [undefined, '', '  ', '{', 'null', '[]', '{}', ' '.repeat(16_385)])
    assert.throws(() => verifyDrainReceipt(raw, binding), /RECEIPT_/u);
});

const wrongIdentity = [
  [
    'repository',
    r => {
      r.release.manifest.repository = 'example/other';
    },
  ],
  [
    'environment',
    r => {
      r.release.manifest.environment = 'production';
    },
  ],
  [
    'backend',
    r => {
      r.release.manifest.plan.backendMarkerSha256 = '3'.repeat(64);
    },
  ],
  [
    'commit',
    r => {
      r.release.manifest.commitSha = '0'.repeat(40);
    },
  ],
  [
    'attested image',
    r => {
      r.release.manifest.imageDigest = vercelOutputDigest;
    },
  ],
  [
    'deployment ID',
    r => {
      r.release.deploymentId = 'dpl_456';
    },
  ],
  [
    'deployment attempt',
    r => {
      r.release.deploymentAttempt = '2';
    },
  ],
  [
    'journal',
    r => {
      r.release.manifest.plan.journalSha256 = '4'.repeat(64);
    },
  ],
  [
    'expand index',
    r => {
      r.release.manifest.plan.expand.idx = 109;
    },
  ],
  [
    'contract tag',
    r => {
      r.release.manifest.plan.contract.tag = '0111_other_contract';
    },
  ],
  [
    'contract timestamp',
    r => {
      r.release.manifest.plan.contract.when++;
    },
  ],
  [
    'contract SQL hash',
    r => {
      r.release.manifest.plan.contract.hash = '5'.repeat(64);
    },
  ],
  [
    'manifest digest',
    r => {
      r.manifestSha256 = '6'.repeat(64);
    },
  ],
  [
    'contract invocation replay',
    r => {
      r.invocation.attempt = '1';
    },
  ],
];
for (const [field, mutate] of wrongIdentity) {
  test(`refuses the wrong ${field} independently`, () => {
    const receipt = fixture();
    mutate(receipt);
    assert.throws(
      () => verifyDrainReceipt(JSON.stringify(receipt), binding),
      /RECEIPT_RELEASE_OR_INVOCATION_MISMATCH/u
    );
  });
}

test('requires a complete, recent drain with an expiry and zero outstanding work', () => {
  for (const invalid of [
    { expiresAt: '2026-11-26T12:00:00.000Z' },
    { observedAt: '2026-11-26T12:01:00.000Z' },
    { observedAt: '2026-11-26T11:30:00.000Z' },
    { inFlightTransactions: 1 },
    { preparedTransactions: 1 },
    { outstandingWrites: 1 },
    { writers: { webEndpoints: [], workers: [], schedulers: [] } },
    { fence: '' },
  ]) {
    const receipt = fixture();
    Object.assign(receipt.evidence, invalid);
    assert.throws(() => verifyDrainReceipt(JSON.stringify(receipt), binding), /RECEIPT_/u);
  }
});

test('binds an authenticated approved reviewer to the exact receipt bytes and contract environment', () => {
  const raw = JSON.stringify(fixture());
  const approval = verifyDrainReceipt(raw, binding);
  const review = {
    state: 'approved',
    comment: `release-drain sha256:${approval.receiptSha256}`,
    environments: [{ name: invocation.environment }],
    user: { id: 123, login: 'release-owner', type: 'User' },
  };
  const authority = {
    environment: invocation.environment,
    reviewerIds: '123,456',
    receiptSha256: approval.receiptSha256,
  };
  assert.deepEqual(verifyGitHubApproval([review], authority), {
    operatorId: 123,
    operatorLogin: 'release-owner',
  });
  for (const reviews of [
    [],
    [review, review],
    [{ ...review, state: 'rejected' }],
    [{ ...review, comment: 'release approved' }],
    [{ ...review, environments: [{ name: 'staging' }] }],
    [{ ...review, user: { ...review.user, id: 789 } }],
    [{ ...review, user: { ...review.user, type: 'Bot' } }],
  ])
    assert.throws(() => verifyGitHubApproval(reviews, authority), /RECEIPT_APPROVAL_MISSING/u);
  assert.throws(
    () => verifyGitHubApproval([review], { ...authority, receiptSha256: digest(`${raw}\n`) }),
    /RECEIPT_APPROVAL_MISSING/u
  );
});

test('rechecks the immutable deployment ID and canonical alias even when the build SHA is unchanged', async () => {
  const env = {
    VERCEL_TOKEN: 'synthetic',
    VERCEL_ORG_ID: 'team_1',
    VERCEL_PROJECT_ID: 'project_1',
  };
  const providerDeployment = {
    id: release.deploymentId,
    url: release.hostname,
    teamId: env.VERCEL_ORG_ID,
    projectId: env.VERCEL_PROJECT_ID,
    readyState: 'READY',
  };
  const alias = {
    alias: 'staging.interdomestik.com',
    projectId: env.VERCEL_PROJECT_ID,
    deploymentId: release.deploymentId,
  };
  const metadata = {
    environment: 'staging',
    commitSha,
    sourceImageDigest: imageDigest,
    vercelOutputDigest,
  };
  const check = (changes = {}) =>
    verifyDeployment(release, {
      env,
      fetchImpl: async url =>
        Response.json(
          url.pathname.includes('/aliases/')
            ? { ...alias, ...changes.alias }
            : { ...providerDeployment, ...changes.deployment }
        ),
      fetchAttestation: async () => JSON.stringify({ ...metadata, ...changes.metadata }),
    });
  assert.equal(await check(), release.deploymentId);
  await assert.rejects(check({ alias: { deploymentId: 'dpl_456' } }), /CANONICAL_ALIAS_MISMATCH/u);
  await assert.rejects(check({ deployment: { id: 'dpl_456' } }), /IMMUTABLE_DEPLOYMENT_MISMATCH/u);
  await assert.rejects(
    check({ metadata: { sourceImageDigest: vercelOutputDigest } }),
    /DEPLOYMENT_ATTESTATION_MISMATCH/u
  );
});

test('the shared entry point accepts only reviewed main push/dispatch and release tag push contexts', () => {
  const context = (event, ref) => ({
    GITHUB_ACTIONS: 'true',
    GITHUB_SERVER_URL: 'https://github.com',
    GITHUB_REPOSITORY: repository,
    GITHUB_SHA: commitSha,
    GITHUB_WORKFLOW_SHA: commitSha,
    GITHUB_EVENT_NAME: event,
    GITHUB_REF: ref,
    GITHUB_WORKFLOW_REF: `${repository}/.github/workflows/cd.yml@${ref}`,
    GITHUB_RUN_ID: '123',
    GITHUB_RUN_ATTEMPT: '2',
    RELEASE_ENVIRONMENT: 'staging',
  });
  for (const [event, ref] of [
    ['push', 'refs/heads/main'],
    ['workflow_dispatch', 'refs/heads/main'],
    ['push', 'refs/tags/v1'],
  ])
    assert.equal(readContext(context(event, ref), () => commitSha).commitSha, commitSha);
  for (const [event, ref] of [
    ['workflow_dispatch', 'refs/heads/candidate'],
    ['workflow_dispatch', 'refs/tags/v1'],
    ['push', 'refs/tags/nightly'],
    ['pull_request', 'refs/heads/main'],
  ])
    assert.throws(
      () => readContext(context(event, ref), () => commitSha),
      /RELEASE_CONTEXT_INVALID/u
    );
  assert.throws(
    () => readContext(context('push', 'refs/heads/main'), () => '0'.repeat(40)),
    /RELEASE_CONTEXT_INVALID/u
  );
});

const workflow = yaml.load(
  readFileSync(new URL('../../.github/workflows/cd.yml', import.meta.url), 'utf8')
);

test('CD serializes every trigger and protects each schema-writing job', () => {
  assert.deepEqual(workflow.on.push, { branches: ['main'], tags: ['v*'] });
  assert.deepEqual(Object.keys(workflow.on).sort(), ['push', 'workflow_dispatch']);
  assert.deepEqual(workflow.concurrency, {
    group: 'cd-staging-canonical-${{ github.repository }}',
    'cancel-in-progress': false,
  });
  const jobs = workflow.jobs;
  const scope = jobs.scope.steps.find(step => step.id === 'classify').run;
  assert.match(scope, /workflow_dispatch:refs\/heads\/main/u);
  assert.match(scope, /rev-parse refs\/remotes\/origin\/main/u);
  const migrationJobs = [
    'expand-staging',
    'contract-staging',
    'expand-production',
    'contract-production',
  ];
  for (const [name, job] of Object.entries(jobs)) {
    const migrations = job.steps.filter(step =>
      String(step.run).includes('migration-phase/run.mjs')
    );
    if (migrationJobs.includes(name)) {
      const [mode, environment] = name.split('-');
      assert.equal(job.environment.name, `${environment}-migration-${mode}`);
      assert.equal(migrations.length, 1);
      assert.ok(migrations[0].run.endsWith(` ${mode}`));
      assert.deepEqual(
        job.steps.filter(step => step.env?.RELEASE_MIGRATION_URL),
        migrations
      );
    } else {
      assert.equal(migrations.length, 0);
      assert.doesNotMatch(JSON.stringify(job), /RELEASE_MIGRATION_URL|\bdb:migrate\b/u);
    }
  }
  for (const env of ['staging', 'production']) {
    assert.ok(jobs[`expand-${env}`].needs.includes(`build-${env}`));
    assert.ok(jobs[`deploy-${env}`].needs.includes(`expand-${env}`));
    assert.ok(jobs[`contract-${env}`].needs.includes(`deploy-${env}`));
  }
  assert.ok(jobs['contract-staging'].needs.includes('e2e-staging'));
  assert.ok(jobs['production-evidence'].needs.includes('finalize-staging'));
  for (const [job, env] of [
    ['finalize-staging', 'staging'],
    ['verify-production', 'production'],
  ]) {
    assert.ok(jobs[job].needs.includes(`contract-${env}`));
    assert.match(
      jobs[job].if,
      /contract_required == 'true' && needs\.contract-\w+\.result == 'success'/u
    );
    assert.match(
      jobs[job].if,
      /contract_required == 'false' && needs\.contract-\w+\.result == 'skipped'/u
    );
  }
  const final = jobs['finalize-staging'].steps.find(
    step => step.name === 'Verify Staging Full Journal'
  );
  assert.equal(final.env.RUNTIME_ATTESTATION_EXPAND_MANIFEST, undefined);
});

test('rollback requires initial attempt, skipped contract and demonstrated predecessor compatibility', () => {
  const rollback = workflow.jobs['rollback-staging-alias'];
  assert.match(rollback.if, /github.run_attempt == 1/u);
  assert.match(rollback.if, /needs.contract-staging.result == 'skipped'/u);
  assert.ok(rollback.needs.includes('contract-staging'));
  const restore = rollback.steps.find(step => step.name === 'Restore exact staging alias preimage');
  assert.match(restore.if, /steps.predecessor.outputs.compatible == 'true'/u);
  const deploy = workflow.jobs['deploy-staging'];
  const preimageUpload = deploy.steps.find(
    step => step.name === 'Upload staging alias preimage receipt'
  );
  const preimageDownload = rollback.steps.find(
    step => step.name === 'Download staging alias preimage receipt'
  );
  assert.equal(preimageUpload.with.name, preimageDownload.with.name);
  assert.match(preimageUpload.with.name, /github\.run_attempt/u);
});
