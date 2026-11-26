import { approved, lockfile, now } from './verification-evidence-test-fixture.mjs';
import { checkGrant, makeGrant, observeInvocation } from './verification-evidence/m4-dispatch.mjs';
import { M4_SCRIPT } from './verification-evidence/manifest.mjs';
import { checkReceipt } from './verification-evidence/receipt.mjs';
import { assertEvidence } from './verification-evidence/ticket.mjs';
import { harness, trusted } from './verify-machine-harness.mjs';
import { runVerifyMachine } from './verify-machine.mjs';

export function verifier(...jobs) {
  return {
    approval: () => approved,
    now: () => now,
    checkManifest() {},
    checkGitInputs: () => ({ lockfileSha256: lockfile }),
    authority: (_stage, _approved, _root, queued) => {
      const f = jobs.find(job => job.current.attempt === queued.attempt);
      assertEvidence(f?.job.ticketId === queued.ticketId, 'queue-ticket-changed');
      return {
        identity: f.current,
        macJobId: '0-0000000000000000001-1234',
        m5: {
          dispatcherExit: 0,
          runId: f.receipt.runId,
          receiptSha256: f.verify().receiptSha256,
        },
      };
    },
    checkReceipt: (directory, approval, at, current, _authenticate, job) =>
      checkReceipt(directory, approval, at, current, jobs[0].authenticate, job),
  };
}

export function stampFixture(t, f, scope) {
  const h = harness({
    marker: { ...trusted(), sha256: scope.markerSha256 },
    env: { INTERDOMESTIK_M4_DISPATCH_DIR: '/grant', INTERDOMESTIK_M4_QUEUE_SCOPE: '{}' },
  });
  t.after(h.cleanup);
  const grant = makeGrant(scope, f.job, approved.sha256, h.deps.cwd);
  const policy = scope.method === 'composed-trial' ? { ...approved, mode: 'trial' } : approved;
  let at = now;
  h.deps.now = () => new Date(at).toISOString();
  h.deps.verifyComposition = (_root, _env, _stage, lane) => {
    checkGrant(grant, f.job, policy, at);
    return { scope: grant.scope, runId: grant.runIds[lane] };
  };
  function run(command, lane, time) {
    at = time;
    h.deps.env.npm_lifecycle_event = lane === 'pr-verify' ? M4_SCRIPT : 'security:guard';
    return runVerifyMachine([command, lane], h.deps);
  }
  return { ...h, grant, run };
}

export function observe(grant, lines, exit) {
  const observation = observeInvocation(grant);
  lines.forEach(observation.line);
  return observation.result(exit);
}
