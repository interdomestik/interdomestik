import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import yaml from 'js-yaml';

import {
  assertAuthorityReviewed,
  checkedOutSha,
  assertDispatchContext,
  connectionOptions,
  describeTarget,
  parseTarget,
  receiptPath,
  run,
} from './runtime-attestation/enrol-staging.mjs';
import { STAGING_AUTHORITY } from './runtime-attestation/staging-authority.mjs';
import { STAGING_EXPECTATION } from './runtime-attestation/staging-expectation.mjs';
import { MARKER_PATTERN } from './runtime-attestation/enrol-core.mjs';

// U2-e staging enrolment: the workflow can only run the reviewed runner from main by manual
// dispatch, secrets reach only that step, and the runner refuses before connecting unless the
// dispatch context and the reviewed staging authority hold.

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const WORKFLOW_PATH = '.github/workflows/staging-runtime-attestation-enrol.yml';
const workflow = yaml.load(fs.readFileSync(path.join(ROOT, WORKFLOW_PATH), 'utf8'));
const job = workflow.jobs.enrol;
const SHA = 'a'.repeat(40);
const CONTEXT = {
  GITHUB_ACTIONS: 'true',
  GITHUB_REPOSITORY: 'interdomestik/interdomestik',
  GITHUB_EVENT_NAME: 'workflow_dispatch',
  GITHUB_REF: 'refs/heads/main',
  GITHUB_SHA: SHA,
  GITHUB_RUN_ID: '123',
  GITHUB_RUN_ATTEMPT: '1',
};
const AUTHORITY = STAGING_AUTHORITY;
const UNREVIEWED = { ...STAGING_AUTHORITY, reviewed: false };
const PRODUCTION_REF = 'gunosplgrvnvrftudttr';
const CA_SHA256 = '700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7';
const HOST = STAGING_AUTHORITY.host;
const ADMIN_PASS = 'fixture-admin-pass';
const RUNTIME_PASS = 'fixture-runtime-pass';
const urlFor = (user, pass) => `postgresql://${user}:${pass}@${HOST}:5432/postgres`;
const ADMIN_URL = urlFor('postgres.xjyseqtfuxcuviiankhy', ADMIN_PASS);
const RUNTIME_URL = urlFor('interdomestik_runtime_rls.xjyseqtfuxcuviiankhy', RUNTIME_PASS);

const refusal = code => error => error?.code === code;

test('workflow: manual dispatch from main only, read-only token, no overlapping runs', () => {
  assert.deepEqual(Object.keys(workflow.on), ['workflow_dispatch']);
  assert.equal(workflow.on.workflow_dispatch, null, 'no dispatch inputs');
  assert.deepEqual(workflow.permissions, { contents: 'read' });
  assert.deepEqual(workflow.concurrency, {
    group: 'staging-runtime-attestation-enrol',
    'cancel-in-progress': false,
  });
  assert.deepEqual(Object.keys(workflow.jobs), ['enrol']);
  for (const clause of [
    "github.repository == 'interdomestik/interdomestik'",
    "github.event_name == 'workflow_dispatch'",
    "github.ref == 'refs/heads/main'",
  ])
    assert.ok(job.if.includes(clause), clause);
  assert.deepEqual(job.environment, { name: 'staging', deployment: false });
  assert.ok(job['timeout-minutes'] <= 15);
  assert.equal(job.permissions, undefined);
});

test('workflow: pinned actions, credential-free checkout, secrets only in the enrol step', () => {
  for (const step of job.steps.filter(step => step.uses))
    assert.match(step.uses, /^[a-z-]+\/[a-z-]+@[0-9a-f]{40}$/u, step.uses);
  const [checkout] = job.steps;
  assert.deepEqual(checkout.with, { ref: '${{ github.sha }}', 'persist-credentials': false });
  const withSecrets = job.steps.filter(step => JSON.stringify(step).includes('secrets.'));
  assert.equal(withSecrets.length, 1);
  const [enrol] = withSecrets;
  assert.equal(enrol.run, 'node scripts/ci/runtime-attestation/enrol-staging.mjs');
  assert.deepEqual(enrol.env, {
    DATABASE_URL: '${{ secrets.DATABASE_URL }}',
    DATABASE_URL_RLS: '${{ secrets.DATABASE_URL_RLS }}',
  });
  const install = job.steps.findIndex(step => step.name === 'Install locked dependencies');
  assert.ok(install >= 0 && install < job.steps.indexOf(enrol));
  assert.equal(job.steps[install].run, 'pnpm install --frozen-lockfile --ignore-scripts');
  const upload = job.steps.at(-1);
  assert.equal(upload.if, '${{ always() }}');
  assert.equal(
    upload.with.path,
    'tmp/runtime-attestation-enrol/${{ github.run_id }}-${{ github.run_attempt }}/receipt.json'
  );
});

test('runner: the dispatch context is checked again before any connection', () => {
  assert.doesNotThrow(() => assertDispatchContext(CONTEXT, SHA));
  for (const [change, code] of [
    [{ GITHUB_ACTIONS: undefined }, 'NOT_GITHUB_ACTIONS'],
    [{ GITHUB_REPOSITORY: 'fork/interdomestik' }, 'REPOSITORY_REJECTED'],
    [{ GITHUB_EVENT_NAME: 'push' }, 'EVENT_REJECTED'],
    [{ GITHUB_REF: 'refs/heads/feature' }, 'REF_REJECTED'],
    [{ GITHUB_SHA: 'b'.repeat(40) }, 'CHECKOUT_SHA_MISMATCH'],
    [{ GITHUB_RUN_ID: '../1' }, 'RUN_ID_INVALID'],
  ])
    assert.throws(() => assertDispatchContext({ ...CONTEXT, ...change }, SHA), refusal(code));
});

test('runner: the committed authority is the reviewed staging project, never production', () => {
  assert.doesNotThrow(() => assertAuthorityReviewed(STAGING_AUTHORITY));
  assert.ok(Object.isFrozen(STAGING_AUTHORITY));
  assert.deepEqual(
    [STAGING_AUTHORITY.projectRef, STAGING_AUTHORITY.adminUser, STAGING_AUTHORITY.runtimeUser],
    [
      'xjyseqtfuxcuviiankhy',
      'postgres.xjyseqtfuxcuviiankhy',
      'interdomestik_runtime_rls.xjyseqtfuxcuviiankhy',
    ]
  );
  assert.equal(JSON.stringify(STAGING_AUTHORITY).includes(PRODUCTION_REF), false);
  assert.equal(
    crypto.createHash('sha256').update(STAGING_AUTHORITY.caPem).digest('hex'),
    CA_SHA256,
    'the pinned CA is the reviewed Dashboard download'
  );
  assert.throws(() => assertAuthorityReviewed(UNREVIEWED), refusal('STAGING_AUTHORITY_UNREVIEWED'));
  for (const change of [{ caPem: null }, { port: null }, { identityProbeUserId: '' }])
    assert.throws(
      () => assertAuthorityReviewed({ ...AUTHORITY, ...change }),
      refusal('STAGING_AUTHORITY_INCOMPLETE')
    );
  assert.throws(
    () => assertAuthorityReviewed({ ...AUTHORITY, runtimeUser: 'postgres.xjyseqtfuxcuviiankhy' }),
    refusal('STAGING_AUTHORITY_ROLE_MISMATCH')
  );
  for (const change of [
    { adminUser: `postgres.${PRODUCTION_REF}` },
    { runtimeUser: 'interdomestik_runtime_rls' },
    { projectRef: PRODUCTION_REF },
  ])
    assert.throws(
      () => assertAuthorityReviewed({ ...AUTHORITY, ...change }),
      refusal('STAGING_AUTHORITY_PROJECT_MISMATCH')
    );
});

test('runner: secret URLs must match the reviewed authority exactly', () => {
  assert.deepEqual(parseTarget(ADMIN_URL, AUTHORITY, 'ADMIN'), {
    username: 'postgres.xjyseqtfuxcuviiankhy',
    password: ADMIN_PASS,
  });
  assert.equal(
    parseTarget(RUNTIME_URL, AUTHORITY, 'RUNTIME').username,
    'interdomestik_runtime_rls.xjyseqtfuxcuviiankhy'
  );
  for (const [url, code] of [
    ['not a url', 'ADMIN_URL_INVALID'],
    [ADMIN_URL.replace('postgresql:', 'http:'), 'ADMIN_URL_INVALID'],
    [ADMIN_URL.replace('aws-1-eu-west-1', 'aws-0-eu-central-1'), 'ADMIN_HOST_REJECTED'],
    // The production admin login on the same shared pooler host (the 2026-11-06 staging secret).
    [urlFor(`postgres.${PRODUCTION_REF}`, ADMIN_PASS), 'ADMIN_USER_REJECTED'],
    [ADMIN_URL.replace(':5432', ':6543'), 'ADMIN_PORT_REJECTED'],
    [`${ADMIN_URL}x`, 'ADMIN_DATABASE_REJECTED'],
    [urlFor('other', ADMIN_PASS), 'ADMIN_USER_REJECTED'],
    [ADMIN_URL.replace(`:${ADMIN_PASS}`, ''), 'ADMIN_PASSWORD_MISSING'],
    [`${ADMIN_URL}?sslmode=disable`, 'ADMIN_URL_OPTION_REJECTED'],
    [`${ADMIN_URL}?options=-csearch_path%3Dx`, 'ADMIN_URL_OPTION_REJECTED'],
  ])
    assert.throws(() => parseTarget(url, AUTHORITY, 'ADMIN'), refusal(code), url);
  const options = connectionOptions({ username: 'postgres', password: ADMIN_PASS }, AUTHORITY);
  assert.deepEqual(options.ssl, {
    ca: AUTHORITY.caPem,
    servername: AUTHORITY.host,
    rejectUnauthorized: true,
  });
  assert.equal(options.host, AUTHORITY.host);
});

test('runner: an unreviewed run records candidate facts, never connects, never records secrets', async () => {
  let connections = 0;
  const env = { ...CONTEXT, DATABASE_URL: ADMIN_URL, DATABASE_URL_RLS: RUNTIME_URL };
  const receipt = await run({
    env,
    headSha: SHA,
    authority: UNREVIEWED,
    connect: () => (connections += 1),
  });
  assert.equal(connections, 0);
  assert.deepEqual(
    [receipt.ok, receipt.transaction, receipt.readback, receipt.code],
    [false, 'not_started', 'not_run', 'STAGING_AUTHORITY_UNREVIEWED']
  );
  assert.deepEqual(receipt.candidate.runtime, describeTarget(RUNTIME_URL));
  assert.equal(receipt.candidate.admin.passwordPresent, true);
  const text = JSON.stringify(receipt);
  for (const secret of [ADMIN_PASS, RUNTIME_PASS]) assert.equal(text.includes(secret), false);
  const outside = await run({
    env: { ...env, GITHUB_REF: 'refs/heads/x' },
    headSha: SHA,
    authority: UNREVIEWED,
  });
  assert.deepEqual([outside.code, outside.candidate], ['REF_REJECTED', undefined]);
});

test('runner: candidate facts copy only allowlisted shapes, never other URL content', async () => {
  const CANARY = 'canary7f3a';
  const odd = [
    `${ADMIN_URL}?sslmode=${CANARY}`,
    `${ADMIN_URL}?${CANARY}=1`,
    urlFor(`u%20${CANARY}`, ADMIN_PASS),
    `postgresql://postgres:${ADMIN_PASS}@${CANARY}%2Fx.example:5432/db%20${CANARY}`,
  ];
  for (const url of odd) {
    const facts = describeTarget(url);
    assert.equal(JSON.stringify(facts).includes(CANARY), false, url);
    assert.equal(JSON.stringify(facts).includes(ADMIN_PASS), false, url);
  }
  assert.deepEqual(
    [describeTarget(odd[0]).sslmode, describeTarget(odd[1]).otherParameters],
    ['unrecognized', 1]
  );
  assert.equal(describeTarget(`${ADMIN_URL}?sslmode=require`).sslmode, 'require');
  const env = { ...CONTEXT, DATABASE_URL: odd[0], DATABASE_URL_RLS: odd[2] };
  const receipt = await run({
    env,
    headSha: SHA,
    authority: UNREVIEWED,
    connect: () => assert.fail('connected'),
  });
  assert.equal(JSON.stringify(receipt).includes(CANARY), false);
});

test('runner: a reviewed run never connects with the production admin secret', async () => {
  let connections = 0;
  const env = {
    ...CONTEXT,
    DATABASE_URL: urlFor(`postgres.${PRODUCTION_REF}`, ADMIN_PASS),
    DATABASE_URL_RLS: RUNTIME_URL,
  };
  const receipt = await run({ env, headSha: SHA, connect: () => (connections += 1) });
  assert.deepEqual(
    [connections, receipt.ok, receipt.transaction, receipt.code, receipt.candidate],
    [0, false, 'not_started', 'ADMIN_USER_REJECTED', undefined]
  );
});

test('runner: the receipt path is built from numeric run ids only', () => {
  assert.equal(
    receiptPath('/r', CONTEXT),
    path.join('/r', 'tmp/runtime-attestation-enrol/123-1/receipt.json')
  );
  assert.equal(
    receiptPath('/r', { GITHUB_RUN_ID: '../../etc', GITHUB_RUN_ATTEMPT: '1' }),
    path.join('/r', 'tmp/runtime-attestation-enrol/invalid-run/receipt.json')
  );
});

test('runner: the checkout commit comes from a detached .git/HEAD only', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enrol-head-'));
  try {
    assert.equal(checkedOutSha(root), null);
    fs.mkdirSync(path.join(root, '.git'));
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), `${SHA}\n`);
    assert.equal(checkedOutSha(root), SHA);
    fs.writeFileSync(path.join(root, '.git', 'HEAD'), 'ref: refs/heads/main\n');
    assert.equal(checkedOutSha(root), null);
    assert.throws(() => assertDispatchContext(CONTEXT, null), refusal('CHECKOUT_SHA_MISMATCH'));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('expectation: the enrolled marker is a single well-formed staging label', () => {
  assert.match(STAGING_EXPECTATION.backendMarker, MARKER_PATTERN);
});
