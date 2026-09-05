import { execFileSync, spawnSync } from 'node:child_process';
import { dirname, isAbsolute, resolve } from 'node:path';
import { types } from 'node:util';
import { canonicalJson, must, sha256 } from './slice-rehearse-canonical.mjs';
import {
  acquireHeavyProofExecutionLease,
  normalizeHeavyProofExecution,
  recordHeavyProofExecution,
} from './slice-rehearse-proof-ledger.mjs';

function defaultVerifyCandidate(report) {
  const options = {
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    maxBuffer: 1024 * 1024,
    timeout: 30_000,
  };
  return (
    execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], options).trim() ===
      report.repository?.headSha &&
    execFileSync('/usr/bin/git', ['rev-parse', 'HEAD^{tree}'], options).trim() ===
      report.repository?.treeSha &&
    execFileSync('/usr/bin/git', ['status', '--porcelain'], options).trim() === ''
  );
}
export function validateProofExecutionPlan(
  report,
  execution,
  verifyCandidate = defaultVerifyCandidate
) {
  const value = normalizeHeavyProofExecution(execution);
  must(
    report && typeof report === 'object' && !Array.isArray(report),
    'proof report is unavailable'
  );
  must(report.schemaVersion === 1, 'proof report schema is invalid');
  must(
    report.reportSha256 === sha256(canonicalJson({ ...report, reportSha256: null })),
    'proof report digest is invalid'
  );
  must(
    Array.isArray(report.authorityStops) && report.authorityStops.length === 0,
    'proof report has authority stops'
  );
  const planned = report.evidence?.executionPlan?.run;
  must(Array.isArray(planned), 'proof execution plan is unavailable');
  const pending = report.operationalEnvelope?.requiredOperations ?? [];
  must(
    !pending.some(operation =>
      /^(?:add_focused_test|bounded_force_with_lease_rebuild|derived_capacity_rebind|extract_cohesive_helper|fresh_worktree_patch_replay|sequence_prerequisite_before_projection|split_focused_test)$/u.test(
        operation
      )
    ),
    'identity-changing work is pending before heavy proof'
  );
  must(
    planned.some(item => item?.lane === value.lane && item?.evidenceKey === value.evidenceKey),
    'heavy proof execution is outside the invalidated-only plan'
  );
  must(
    typeof verifyCandidate === 'function' && verifyCandidate(report) === true,
    'heavy proof candidate identity differs'
  );
  return value;
}
const PROOF_COMMANDS = Object.freeze({
  'pr-e2e': Object.freeze(
    [['e2e:gate:pr'], ['--filter', '@interdomestik/web', 'run', 'e2e:smoke']].map(Object.freeze)
  ),
});
const defaultPnpm = () => process.env.npm_execpath ?? resolve(dirname(process.execPath), 'pnpm');
const isTrustedPnpm = path => isAbsolute(path ?? '') && /\/pnpm(?:\.[cm]?js)?$/u.test(path);
export function executePnpmProof(
  args,
  { nodePath = process.execPath, npmExecPath = defaultPnpm(), spawn = spawnSync } = {}
) {
  must(isAbsolute(nodePath), 'trusted Node runtime is unavailable');
  must(isTrustedPnpm(npmExecPath), 'trusted pnpm runtime is unavailable');
  return spawn(nodePath, [npmExecPath, ...args], {
    cwd: process.cwd(),
    encoding: 'utf8',
    env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
    shell: false,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 90 * 60_000,
  });
}
export function authorizedHeavyProofHost({ platform = process.platform, env = process.env } = {}) {
  if (platform !== 'linux') return false;
  return (
    (env.GITHUB_ACTIONS === 'true' && env.RUNNER_OS === 'Linux') ||
    env.RUNNER_NAME === 'interdomestik-z620-staging'
  );
}
export function runHeavyProofExecution({
  ledgerPath,
  execution,
  report,
  execute = executePnpmProof,
  verifyCandidate,
  record = recordHeavyProofExecution,
  acquireLease = acquireHeavyProofExecutionLease,
  verifyProofHost = authorizedHeavyProofHost,
  verifyFinalHead = () => false,
}) {
  const value = validateProofExecutionPlan(report, execution, verifyCandidate);
  const commands = PROOF_COMMANDS[value.lane];
  must(commands, 'heavy proof lane has no fixed executor');
  must(
    typeof execute === 'function' && !types.isAsyncFunction(execute),
    'synchronous proof executor required'
  );
  must(verifyProofHost({ report, execution: value }) === true, 'heavy proof host is unauthorized');
  must(verifyFinalHead(report) === true, 'current final-head review evidence is unavailable');
  const { sliceId } = report;
  const { headSha, treeSha } = report.repository;
  const scope = { sliceId, headSha, treeSha };
  const releaseLease = acquireLease({ ledgerPath, scope, execution: value });
  must(typeof releaseLease === 'function', 'heavy proof lease is invalid');
  let preserveLease = true;
  const finish = (status, exitCode, commandIndex) => {
    record({
      ledgerPath,
      scope,
      execution: value,
      status,
      finishedAt: new Date().toISOString(),
      exitCode,
    });
    preserveLease = status === 'unknown';
    return {
      lane: value.lane,
      runId: value.runId,
      status,
      ...(status === 'succeeded' ? {} : { commandIndex, exitCode }),
    };
  };
  try {
    for (let index = 0; index < commands.length; index += 1) {
      let result;
      try {
        validateProofExecutionPlan(report, execution, verifyCandidate);
        must(verifyFinalHead(report) === true, 'final-head review evidence changed');
        result = execute(commands[index]);
        if (types.isPromise(result)) result.catch(() => {});
      } catch {
        return finish('unknown', null, index);
      }
      if (!result || typeof result.then === 'function' || result.error) {
        return finish('unknown', null, index);
      }
      if (result.status !== 0) {
        const code = Number.isInteger(result.status) ? result.status : null;
        const status = code !== null ? 'failed' : 'unknown';
        return finish(status, code, index);
      }
    }
    try {
      validateProofExecutionPlan(report, execution, verifyCandidate);
      must(verifyFinalHead(report) === true, 'final-head review evidence changed');
    } catch {
      return finish('unknown', null, commands.length);
    }
    return finish('succeeded', 0);
  } finally {
    // Unknown process outcomes and missing durable receipts keep their claim.
    releaseLease(preserveLease);
  }
}
