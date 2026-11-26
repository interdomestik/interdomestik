import assert from 'node:assert/strict';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { makeTestSigner } from './migration-phase-test-key.mjs';
import { reserveAttempt } from './migration-phase/attempt.mjs';
import { verifyDeployment } from './migration-phase/deployment.mjs';
import {
  authenticateDrainReceipt,
  digest,
  readBytes,
  verificationKey,
  verifyDrainReceipt,
} from './migration-phase/proof.mjs';

const signer = makeTestSigner();
const now = 2_000_000;
const binding = {
  environment: 'staging',
  manifestSha256: digest('exact manifest bytes'),
  attempt: 'a'.repeat(64),
};
const receipt = {
  ...binding,
  version: 1,
  deployment: {
    id: 'dpl_fixture',
    hostname: 'release-fixture.vercel.app',
    imageDigest: `sha256:${'a'.repeat(64)}`,
    buildDigest: `sha256:${'b'.repeat(64)}`,
    aliasUid: 'alias_fixture',
    aliasUpdatedAt: now - 500,
  },
  drain: {
    evidenceSha256: digest('inventory'),
    fenceId: 'fence-1',
    webEndpoints: ['old-endpoint'],
    workers: [],
    schedulers: [],
    queues: [],
    outstandingWrites: 0,
    inFlightTransactions: 0,
    preparedTransactions: 0,
  },
  observedAt: now - 100,
  expiresAt: now + 5000,
};
const bytes = value => Buffer.from(JSON.stringify(value));
const verify = (value, expected = binding) => verifyDrainReceipt(value, expected, now);

function workspace(t) {
  const dir = mkdtempSync(join(tmpdir(), 'release-phase-unit-'));
  t.after(() => rmSync(dir, { recursive: true, force: true }));
  return dir;
}

test('verifies a FIDO2 SSHSIG over the exact bytes with the pinned key and namespace', t => {
  const root = workspace(t);
  const publicKeyPath = join(root, 'owner.pub');
  writeFileSync(publicKeyPath, signer.key);
  const publicKey = verificationKey(root, publicKeyPath, digest(signer.key));
  const raw = bytes(receipt);
  const signed = signer.sign(raw);
  assert.equal(verify(authenticateDrainReceipt(raw, signed, publicKey)).nonce, binding.attempt);
  const edited = Buffer.concat([raw, Buffer.from('\n')]);
  for (const [document, signature] of [
    [edited, signed],
    [raw, makeTestSigner().sign(raw)],
    [raw, signer.sign(raw, 'file')],
  ])
    assert.throws(
      () => authenticateDrainReceipt(document, signature, publicKey),
      /RECEIPT_SIGNATURE_INVALID/u
    );
  assert.throws(
    () => verificationKey(root, publicKeyPath, digest('different key')),
    /KEY_PIN_MISMATCH/u
  );
});

test('reads proof files only inside the declared runner root', t => {
  const parent = workspace(t);
  const root = join(parent, 'runner');
  const sibling = join(parent, 'runner-other');
  mkdirSync(root);
  mkdirSync(sibling);
  const manifest = join(root, 'manifest.json');
  const outside = join(sibling, 'manifest.json');
  writeFileSync(manifest, 'inside');
  writeFileSync(outside, 'outside');
  symlinkSync(manifest, join(root, 'inside-link'));
  symlinkSync(sibling, join(root, 'outside-link'));
  assert.equal(readBytes(root, join(root, 'inside-link'), 'MANIFEST').toString(), 'inside');
  for (const file of [
    outside,
    `${root}/../runner-other/manifest.json`,
    join(root, 'outside-link/manifest.json'),
  ])
    assert.throws(() => readBytes(root, file, 'MANIFEST'), /RELEASE_PATH_REJECTED/u);
});

test('reserves each nonce once and refuses an unavailable or shared attempt store', t => {
  const dir = workspace(t);
  const store = join(dir, 'attempts');
  const symlink = join(dir, 'linked-attempts');
  mkdirSync(store, { mode: 0o755 });
  symlinkSync(store, symlink);
  assert.throws(
    () => reserveAttempt(dir, join(dir, 'missing'), binding.attempt),
    /ATTEMPT_STORE_REJECTED/u
  );
  assert.throws(() => reserveAttempt(dir, store, binding.attempt), /ATTEMPT_STORE_REJECTED/u);
  chmodSync(store, 0o700);
  assert.throws(() => reserveAttempt(dir, symlink, binding.attempt), /ATTEMPT_STORE_REJECTED/u);
  assert.throws(
    () => reserveAttempt(dir, workspace(t), binding.attempt),
    /ATTEMPT_STORE_REJECTED/u
  );
  reserveAttempt(dir, store, binding.attempt);
  assert.throws(() => reserveAttempt(dir, store, binding.attempt), /RECEIPT_REPLAYED/u);
});

test('requires the approved environment, exact manifest and invocation nonce', () => {
  for (const [key, value] of Object.entries({
    environment: 'production',
    manifestSha256: digest('edited manifest'),
    attempt: 'c'.repeat(64),
  }))
    assert.throws(() => verify(receipt, { ...binding, [key]: value }), /RECEIPT_BINDING_MISMATCH/u);
});

test('checks the whole drain inventory, transaction counts and freshness', () => {
  for (const [key, value] of Object.entries({
    schedulers: undefined,
    workers: [{}],
    outstandingWrites: 1,
    inFlightTransactions: 1,
    preparedTransactions: 1,
  }))
    assert.throws(
      () => verify({ ...receipt, drain: { ...receipt.drain, [key]: value } }),
      /RECEIPT_DRAIN_INVALID/u
    );
  for (const dates of [
    { observedAt: now + 1 },
    { expiresAt: now },
    { expiresAt: now + 600_001 },
    { observedAt: receipt.deployment.aliasUpdatedAt - 1 },
  ])
    assert.throws(() => verify({ ...receipt, ...dates }), /RECEIPT_EXPIRED/u);
});

test('refuses an unpinned or malformed deployment hostname before sending requests', async t => {
  const fetch = t.mock.method(globalThis, 'fetch', () => assert.fail('unexpected request'));
  const expected = receipt.deployment;
  const config = { environment: 'staging', deploymentHosts: [expected.hostname] };
  for (const hostname of [
    'unlisted.vercel.app',
    `http://${expected.hostname}`,
    `${expected.hostname}:8443`,
  ]) {
    await assert.rejects(
      verifyDeployment({ ...expected, hostname }, binding, config),
      /DEPLOYMENT_HOST_NOT_ALLOWED/u
    );
  }
  for (const deploymentHosts of [undefined, [], [`https://${expected.hostname}`]]) {
    await assert.rejects(
      verifyDeployment(expected, binding, { ...config, deploymentHosts }),
      /DEPLOYMENT_HOST_NOT_ALLOWED/u
    );
  }
  await assert.rejects(
    verifyDeployment({ ...expected, id: '../aliases' }, binding, config),
    /RECEIPT_DEPLOYMENT_INVALID/u
  );
  assert.equal(fetch.mock.callCount(), 0);
});

test('checks the deployment, pinned HTTPS attestation and alias without following redirects', async t => {
  t.mock.property(process, 'env', { VERCEL_TOKEN: 'fixture-token' });
  const expected = receipt.deployment;
  const config = {
    environment: 'staging',
    teamId: 'team_fixture',
    projectId: 'prj_fixture',
    deploymentHosts: [expected.hostname, 'second-pinned.vercel.app'],
  };
  const deployment = {
    id: expected.id,
    url: expected.hostname,
    teamId: config.teamId,
    projectId: config.projectId,
    readyState: 'READY',
  };
  const providerUrl = `https://api.vercel.com/v13/deployments/${expected.id}?teamId=${config.teamId}`;
  const aliasUrl = `https://api.vercel.com/v4/aliases/staging.interdomestik.com?teamId=${config.teamId}`;
  const attestationUrl = `https://${expected.hostname}/.well-known/interdomestik-release-attestation.json`;
  const manifest = { ...binding, commitSha: 'a'.repeat(40) };
  let redirect = false;
  const fetch = t.mock.method(globalThis, 'fetch', async (url, options) => {
    if (url.href === providerUrl) {
      assert.equal(options.redirect, 'error');
      return Response.json(deployment);
    }
    if (url.href === aliasUrl) {
      assert.equal(options.redirect, 'error');
      return Response.json({
        alias: 'staging.interdomestik.com',
        projectId: config.projectId,
        deploymentId: expected.id,
        uid: expected.aliasUid,
        updatedAt: expected.aliasUpdatedAt,
      });
    }
    assert.equal(url.href, attestationUrl);
    assert.equal(options.redirect, 'manual');
    if (redirect) return Response.redirect('https://second-pinned.vercel.app/attestation');
    return Response.json({
      environment: manifest.environment,
      commitSha: manifest.commitSha,
      sourceImageDigest: expected.imageDigest,
      vercelOutputDigest: expected.buildDigest,
    });
  });
  await verifyDeployment(expected, manifest, config);
  assert.equal(fetch.mock.callCount(), 3);

  redirect = true;
  await assert.rejects(verifyDeployment(expected, manifest, config), /Attestation redirect limit/u);
  assert.equal(fetch.mock.callCount(), 5);
});
