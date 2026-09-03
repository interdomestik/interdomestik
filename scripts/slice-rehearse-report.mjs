#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  canonicalJson,
  compareText,
  exactKeys,
  must,
  readBoundedRegularText,
} from './slice-rehearse-canonical.mjs';
import { resolveRepositoryAuthority } from './lean-current-authority.mjs';
import {
  authenticateResolverOutput,
  resolveAtAuthorityBoundary,
} from './slice-rehearse-authority-boundary.mjs';
import { execOptions, resolveGhBinary } from './slice-rehearse-operation-live.mjs';
import { readTrustedApprovalCount } from './slice-rehearse-ops.mjs';
import { readHeavyProofRecords } from './slice-rehearse-evidence.mjs';
import { readCheckpointTelemetry } from './slice-telemetry-v2-record.mjs';

const SHA = /^[0-9a-f]{40}$/u;
const COUNTER_KEYS = 'approvals reFreezes retries heavyProofs duplicateHeavyProofs'.split(' ');
const KEYS =
  'approvals baseSha blockerPhase duplicateHeavyProofs headSha heavyProofs mergeSha modelCostUsd prNumber reFreezes retries runnerMinutes schemaVersion scopeDrift sliceId stage treeSha'.split(
    ' '
  );

function count(value, label) {
  must(Number.isSafeInteger(value) && value >= 0, `${label} is invalid`);
  return value;
}

function nullableMetric(value, label) {
  must(value === null || (Number.isFinite(value) && value >= 0), `${label} is invalid`);
  return value;
}

function securityHoldAction(blockerPhase) {
  if (!blockerPhase.startsWith('security_hold:')) return null;
  const match = /^security_hold:(candidate|shared-base):(HIGH|CRITICAL):[A-Za-z0-9@._/-]+$/u.exec(
    blockerPhase
  );
  must(match, 'security blocker attribution invalid');
  return `HOLD(${match[1] === 'candidate' ? 'remediate_candidate_security' : 'await_shared_base_security_maintenance'})`;
}

function compileLegalNextAction(input, approvals, reFreezes, heavyProofs) {
  must(approvals <= 1, 'repeated approval');
  must(reFreezes <= 1, 'multiple re-freezes');
  must(heavyProofs <= 1, 'duplicate final-head proof');
  must(!reFreezes || approvals === 1, 'remediation precedes approval');
  must(input.prNumber === null || approvals === 1, 'PR skips approval');
  must(
    heavyProofs === 0 || (approvals === 1 && input.prNumber !== null),
    'proof skips approval or PR'
  );
  must(
    input.mergeSha === null || (input.prNumber !== null && heavyProofs === 1),
    'merge skips PR or proof'
  );
  if (input.stage === 'final') return 'none';
  const securityAction = securityHoldAction(input.blockerPhase);
  if (securityAction) return securityAction;
  if (
    input.stage === 'authority_hold' ||
    input.blockerPhase !== 'none' ||
    input.scopeDrift.length > 0
  )
    return 'HOLD';
  if (approvals === 0) return 'request_delivery_approval';
  if (input.prNumber === null) return 'create_pull_request';
  if (heavyProofs === 0) return 'run_final_head_heavy_proof';
  if (input.mergeSha === null) return 'conditional_merge';
  return 'verify_merge_consumption';
}

const OPTIONS = Object.freeze({
  encoding: 'utf8',
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  maxBuffer: 8_388_608,
  timeout: 300_000,
});
const git = args => execFileSync('/usr/bin/git', args, OPTIONS).trim();

export function verifyCheckpointGitIdentity(input, facts) {
  return (
    facts.headSha === input.headSha &&
    facts.treeSha === input.treeSha &&
    facts.baseIsAncestor === true &&
    facts.protectedMainSha === (input.stage === 'final' ? input.mergeSha : input.baseSha)
  );
}

function defaultVerifyState(input) {
  const headSha = git(['rev-parse', 'HEAD']);
  const treeSha = git(['rev-parse', 'HEAD^{tree}']);
  const protectedMainSha = git(['rev-parse', 'origin/main']);
  let baseIsAncestor = false;
  try {
    git(['merge-base', '--is-ancestor', input.baseSha, input.headSha]);
    baseIsAncestor = true;
  } catch {
    baseIsAncestor = false;
  }
  const gitFacts = { headSha, treeSha, protectedMainSha, baseIsAncestor };
  if (!verifyCheckpointGitIdentity(input, gitFacts)) return { verified: false };
  if (input.prNumber !== null) {
    const pull = JSON.parse(
      execFileSync(
        resolveGhBinary(),
        [
          'pr',
          'view',
          String(input.prNumber),
          '--json',
          'headRefOid,baseRefName,state,mergeCommit',
        ],
        execOptions('gh')
      )
    );
    if (pull.headRefOid !== input.headSha || pull.baseRefName !== 'main')
      return { verified: false };
    if (
      input.stage === 'final' &&
      (pull.state !== 'MERGED' || pull.mergeCommit?.oid !== input.mergeSha)
    )
      return { verified: false };
  }
  if (['authority_hold', 'final'].includes(input.stage)) {
    const authority = resolveAtAuthorityBoundary({
      boundary: input.stage === 'final' ? 'post_merge' : 'candidate_freeze',
      readLiveAuthority: () =>
        authenticateResolverOutput(resolveRepositoryAuthority(process.cwd(), true)),
    }).authority;
    if (authority.runtimeAuthorized !== false || authority.activeSlice !== null)
      return { verified: false };
  }
  const telemetry = readCheckpointTelemetry(input);
  const successes = readHeavyProofRecords(input).filter(record => record.status === 'succeeded');
  const heavyProofs = successes.length;
  const duplicateHeavyProofs = heavyProofs - new Set(successes.map(item => item.evidenceKey)).size;
  const counters = {
    approvals: readTrustedApprovalCount(input.sliceId),
    reFreezes: telemetry?.reFreezes ?? 0,
    retries: telemetry?.retries ?? 0,
    heavyProofs,
    duplicateHeavyProofs,
  };
  must(
    (telemetry?.deliveryApprovals ?? 0) === counters.approvals &&
      (telemetry?.heavyProofs ?? 0) === counters.heavyProofs &&
      (telemetry?.duplicateHeavyProofs ?? 0) === counters.duplicateHeavyProofs,
    'telemetry differs from receipts'
  );
  return {
    verified: true,
    counters,
    blockerPhases: Object.keys(telemetry?.blockerDistribution ?? {}),
  };
}

export function generateSliceCheckpoint(input, { verifyState = defaultVerifyState } = {}) {
  exactKeys(input, KEYS, 'slice checkpoint input');
  must(input.schemaVersion === 1, 'checkpoint schema is invalid');
  must(/^[A-Z0-9][A-Z0-9-]+$/u.test(input.sliceId), 'checkpoint slice is invalid');
  must(
    ['checkpoint', 'authority_hold', 'final'].includes(input.stage),
    'checkpoint stage is invalid'
  );
  must(SHA.test(input.baseSha), 'base SHA is invalid');
  must(SHA.test(input.headSha), 'head SHA is invalid');
  must(SHA.test(input.treeSha), 'tree SHA is invalid');
  must(input.mergeSha === null || SHA.test(input.mergeSha), 'merge SHA is invalid');
  must(
    input.prNumber === null || (Number.isSafeInteger(input.prNumber) && input.prNumber > 0),
    'PR number is invalid'
  );
  const claimedCounters = Object.fromEntries(
    COUNTER_KEYS.map(key => [key, count(input[key], key)])
  );
  must(typeof verifyState === 'function', 'checkpoint verifier unavailable');
  const verified = verifyState(input);
  must(
    verified?.verified === true &&
      canonicalJson(verified.counters) === canonicalJson(claimedCounters),
    'counters differ from verified receipts'
  );
  const { approvals, reFreezes, retries, heavyProofs, duplicateHeavyProofs } = verified.counters;
  must(retries <= 3, 'tooling retry ceiling exceeded');
  must(duplicateHeavyProofs === 0, 'duplicate heavy proof');
  must(heavyProofs >= duplicateHeavyProofs, 'proof counts inconsistent');
  must(Array.isArray(input.scopeDrift), 'scope drift is invalid');
  must(
    input.scopeDrift.every(value => typeof value === 'string' && value.length > 0) &&
      new Set(input.scopeDrift).size === input.scopeDrift.length,
    'scope drift entries are invalid'
  );
  must(
    typeof input.blockerPhase === 'string' && input.blockerPhase.length > 0,
    'blocker phase is invalid'
  );
  if (input.blockerPhase.startsWith('security_hold:')) {
    must(
      Array.isArray(verified.blockerPhases) && verified.blockerPhases.includes(input.blockerPhase),
      'security blocker differs from verified telemetry'
    );
  }
  const legalNextAction = compileLegalNextAction(input, approvals, reFreezes, heavyProofs);
  if (input.stage === 'authority_hold') {
    must(input.blockerPhase !== 'none', 'authority hold requires blocker');
  }
  if (input.stage === 'final') {
    must(
      input.prNumber !== null &&
        input.mergeSha !== null &&
        approvals > 0 &&
        heavyProofs > 0 &&
        input.blockerPhase === 'none' &&
        input.scopeDrift.length === 0 &&
        legalNextAction === 'none',
      'final checkpoint missing invariants'
    );
  }
  return {
    ...input,
    approvals,
    reFreezes,
    retries,
    heavyProofs,
    duplicateHeavyProofs,
    runnerMinutes: nullableMetric(input.runnerMinutes, 'runner minutes'),
    modelCostUsd: nullableMetric(input.modelCostUsd, 'model cost'),
    scopeDrift: [...input.scopeDrift].sort(compareText),
    legalNextAction,
  };
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  try {
    must(process.argv.length === 4 && process.argv[2] === '--input', 'usage: --input <path>');
    const report = generateSliceCheckpoint(
      JSON.parse(
        readBoundedRegularText(resolve(process.cwd(), process.argv[3]), {
          label: 'Slice checkpoint input',
          maxBytes: 128 * 1024,
          allowedRoots: [process.cwd(), tmpdir(), '/private/tmp'],
        })
      )
    );
    process.stdout.write(canonicalJson(report));
  } catch (error) {
    process.stderr.write(`slice checkpoint input is invalid: ${error.message}\n`);
    process.exitCode = 1;
  }
}
