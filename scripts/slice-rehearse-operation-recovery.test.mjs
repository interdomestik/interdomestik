import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import { createRecoveryContext } from './lean-current-authority-recovery.mjs';
import { recoveryApprovalBinding } from './slice-rehearse-operation-certificate.mjs';
import { approvalReceiptPath, runSafeOperation } from './slice-rehearse-ops.mjs';
import {
  digest,
  isolatedRoot,
  liveFacts,
  recoveryFile,
  observation,
  operationRequest,
  receipt,
  sha,
} from './slice-rehearse-operation-recovery-fixtures.mjs';

function fixture(t) {
  const root = isolatedRoot(t),
    approvedRequest = operationRequest();
  const request = operationRequest(sha('7'), sha('8'));
  const c = request.authorityCertificate,
    approved = approvedRequest.authorityCertificate;
  fs.writeFileSync(approvalReceiptPath(approved, root), receipt, { mode: 0o600 });
  const execution = {
    baseSha: c.baseSha,
    headSha: c.headSha,
    treeSha: c.treeSha,
    remoteHeadSha: c.expectedRemoteHeadSha,
  };
  const observed = observation(execution);
  Object.assign(observed.approval, {
    bindingSha256: approved.approvalBindingSha256,
    semanticSha256: recoveryApprovalBinding(approved),
  });
  const f = { root, approvedRequest, request, observed, effects: 0, outcome: 'applied' };
  f.options = {
    root,
    readLiveFacts: () => liveFacts(c),
    readAuthority: () => ({
      source: 'live-resolver',
      runtimeAuthorized: true,
      activeSlice: c.sliceId,
    }),
    execute: () => {
      throw new Error('legacy execution must not run');
    },
    recovery: {
      context: createRecoveryContext(() => observed),
      approvedRequest,
      executeConditional: (_command, envelope) => {
        assert.deepEqual(envelope.execution, observed.execution);
        f.effects++;
        if (f.loseResponse) throw new Error('lost response');
      },
      reconcilePrior: prior => ({ outcome: f.outcome, attemptSha256: prior.attemptSha256 }),
    },
    reconcile: () => ({ outcome: f.outcome }),
  };
  return f;
}

test('fresh exact certificate reuses valid semantic approval through existing entrypoint', t => {
  const f = fixture(t);
  assert.notEqual(
    f.request.authorityCertificate.approvalBindingSha256,
    f.approvedRequest.authorityCertificate.approvalBindingSha256
  );
  assert.equal(runSafeOperation(f.request, f.options).status, 'succeeded');
  assert.equal(runSafeOperation(f.request, f.options).status, 'already_applied');
  assert.equal(f.effects, 1);
});

test('lost response, restart and a new attempt cannot duplicate unknown prior effect', t => {
  const f = fixture(t);
  f.loseResponse = true;
  f.outcome = 'unknown';
  assert.equal(runSafeOperation(f.request, f.options).status, 'failed_unknown');
  const next = structuredClone(f.request);
  next.authorityCertificate.certificateId = 'RECOVERY-1-CERT-2';
  next.authorityCertificateSha256 = digest(next.authorityCertificate);
  assert.throws(() => runSafeOperation(next, f.options), /prior outcome unknown/u);
  f.outcome = 'applied';
  assert.equal(runSafeOperation(next, f.options).status, 'already_applied');
  assert.equal(f.effects, 1);
});

test('material drift, revoked approval and denied resolver stop all effects', t => {
  for (const mutate of [
    f => {
      f.observed.approval.valid = false;
    },
    f => {
      f.observed.material.capacityInventory = digest('new usage');
    },
    f => {
      f.options.readAuthority = () => ({ source: 'live-resolver', runtimeAuthorized: false });
    },
  ]) {
    const f = fixture(t);
    mutate(f);
    assert.throws(() => runSafeOperation(f.request, f.options));
    assert.equal(f.effects, 0);
  }
});

test('unsupported provider never falls back to legacy execute', t => {
  const f = fixture(t);
  delete f.options.recovery.executeConditional;
  assert.throws(() => runSafeOperation(f.request, f.options), /trusted recovery options keys/u);
  assert.equal(f.effects, 0);
});

test('unlinked legacy consumption holds', t => {
  const f = fixture(t);
  fs.writeFileSync(
    `${approvalReceiptPath(f.approvedRequest.authorityCertificate, f.root).replace('DELIVERY-1', 'DELIVERY-2')}.old.consumed`,
    'unknown'
  );
  assert.throws(() => runSafeOperation(f.request, f.options), /legacy consumption/u);
  assert.equal(f.effects, 0);
});

test('confirmed not-applied permits one fresh attempt and retains its history', t => {
  const f = fixture(t);
  f.outcome = 'not_applied';
  assert.equal(runSafeOperation(f.request, f.options).status, 'failed_not_applied');
  f.outcome = 'applied';
  assert.equal(runSafeOperation(f.request, f.options).status, 'succeeded');
  const record = JSON.parse(fs.readFileSync(recoveryFile(f.root), 'utf8'));
  assert.equal(record.attempts.length, 2);
  assert.notEqual(record.attempts[0].attemptSha256, record.attempts[1].attemptSha256);
  assert.deepEqual(
    record.attempts.map(a => a.outcome),
    ['not_applied', 'applied']
  );
});

test('ordinary thenable remains quarantined', t => {
  const f = fixture(t);
  f.outcome = 'not_applied';
  f.options.recovery.executeConditional = () => Promise.resolve();
  assert.equal(runSafeOperation(f.request, f.options).status, 'failed_unknown');
  assert.throws(() => runSafeOperation(f.request, f.options), /quarantined/u);
});

test('revocation or protection change during prior reconciliation prevents another effect', t => {
  for (const mutate of [
    f => {
      f.observed.approval.valid = false;
    },
    f => {
      f.observed.material.protection = digest('changed');
    },
  ]) {
    const f = fixture(t);
    f.outcome = 'unknown';
    runSafeOperation(f.request, f.options);
    f.options.recovery.reconcilePrior = prior => {
      mutate(f);
      return { outcome: 'not_applied', attemptSha256: prior.attemptSha256 };
    };
    assert.throws(() => runSafeOperation(f.request, f.options));
    assert.equal(f.effects, 1);
  }
});

test('surviving crash claim and truncated record never release another effect', t => {
  const f = fixture(t);
  f.outcome = 'unknown';
  runSafeOperation(f.request, f.options);
  const file = recoveryFile(f.root);
  const claim = file.replace('.json', '.claim');
  fs.writeFileSync(claim, 'crashed worker\n', { mode: 0o600 });
  assert.throws(() => runSafeOperation(f.request, f.options), { code: 'EEXIST' });
  assert.equal(fs.readFileSync(claim, 'utf8'), 'crashed worker\n');
  fs.unlinkSync(claim); // Test-owned crash fixture only; runtime never reclaims a claim.
  fs.writeFileSync(file, '{', { mode: 0o600 });
  assert.throws(() => runSafeOperation(f.request, f.options), SyntaxError);
  assert.equal(f.effects, 1);
});

test('exclusive claim prevents reentrant dispatch before the first result is recorded', t => {
  const f = fixture(t);
  f.options.recovery.executeConditional = () => {
    assert.throws(() => runSafeOperation(f.request, f.options), { code: 'EEXIST' });
    f.effects++;
  };
  assert.equal(runSafeOperation(f.request, f.options).status, 'succeeded');
  assert.equal(f.effects, 1);
});

test('conditional adapter CAS failure reconciles without a product effect', t => {
  const f = fixture(t);
  f.outcome = 'not_applied';
  f.options.recovery.executeConditional = () => {
    throw new Error('provider CAS mismatch');
  };
  assert.equal(runSafeOperation(f.request, f.options).status, 'failed_not_applied');
  assert.equal(f.effects, 0);
});

test('stale final proof, changed head and wrong prior identity hold', t => {
  const f = fixture(t);
  f.observed.proof.identitySha256 = digest('old head');
  assert.throws(() => runSafeOperation(f.request, f.options), /fresh recovery proof/u);
  f.observed.proof.identitySha256 = digest(f.observed.execution);
  f.options.readLiveFacts = () => ({
    ...liveFacts(f.request.authorityCertificate),
    headSha: sha('9'),
  });
  assert.throws(() => runSafeOperation(f.request, f.options), /exact local head/u);
  f.options.readLiveFacts = () => liveFacts(f.request.authorityCertificate);
  f.outcome = 'unknown';
  runSafeOperation(f.request, f.options);
  f.options.recovery.reconcilePrior = () => ({
    outcome: 'applied',
    attemptSha256: digest('other'),
  });
  assert.throws(() => runSafeOperation(f.request, f.options), /prior reconciliation identity/u);
  assert.equal(f.effects, 1);
});

test('async adapter is rejected before invocation and unreadable receipt blocks recovery', t => {
  const f = fixture(t);
  f.options.recovery.executeConditional = async () => {
    f.effects++;
  };
  assert.throws(() => runSafeOperation(f.request, f.options), /synchronous conditional adapter/u);
  assert.equal(f.effects, 0);
  f.options.recovery.executeConditional = () => {
    f.effects++;
  };
  fs.unlinkSync(approvalReceiptPath(f.approvedRequest.authorityCertificate, f.root));
  assert.throws(() => runSafeOperation(f.request, f.options));
  assert.equal(f.effects, 0);
});

test('historical applied recognition exposes prior execution without attributing it to changed content', t => {
  const f = fixture(t);
  assert.equal(runSafeOperation(f.request, f.options).status, 'succeeded');
  const changed = operationRequest(sha('9'), sha('a'));
  f.options.readAuthority = () => assert.fail('historical recognition grants no authority');
  const result = runSafeOperation(changed, f.options);
  assert.equal(result.status, 'already_applied');
  assert.equal(result.authorityGranted, false);
  assert.equal(result.matchesRequestedExecution, false);
  assert.deepEqual(result.appliedExecution, f.observed.execution);
  assert.equal(f.effects, 1);
});
