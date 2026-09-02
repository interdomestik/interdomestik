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
const KEYS = [
  'approvals',
  'baseSha',
  'blockerPhase',
  'duplicateHeavyProofs',
  'headSha',
  'heavyProofs',
  'mergeSha',
  'modelCostUsd',
  'prNumber',
  'reFreezes',
  'retries',
  'runnerMinutes',
  'schemaVersion',
  'scopeDrift',
  'sliceId',
  'stage',
  'treeSha',
];

function count(value, label) {
  must(Number.isSafeInteger(value) && value >= 0, `${label} is invalid`);
  return value;
}

function nullableMetric(value, label) {
  must(value === null || (Number.isFinite(value) && value >= 0), `${label} is invalid`);
  return value;
}

function compileLegalNextAction(input, approvals, reFreezes, heavyProofs) {
  must(approvals <= 1, 'repeated delivery approval is invalid');
  must(reFreezes <= 1, 'multiple remediation generations are invalid');
  must(heavyProofs <= 1, 'duplicate final-head heavy proof is invalid');
  must(!reFreezes || approvals === 1, 'remediation precedes delivery approval');
  must(
    input.prNumber === null || approvals === 1,
    'pull request transition skips delivery approval'
  );
  must(
    heavyProofs === 0 || (approvals === 1 && input.prNumber !== null),
    'heavy proof transition skips approval or pull request'
  );
  must(
    input.mergeSha === null || (input.prNumber !== null && heavyProofs === 1),
    'merge transition skips pull request or heavy proof'
  );
  if (input.stage === 'final') return 'none';
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

export function verifyCheckpointGitIdentity(input, facts) {
  if (
    facts.headSha !== input.headSha ||
    facts.treeSha !== input.treeSha ||
    facts.baseIsAncestor !== true
  ) {
    return false;
  }
  return input.stage === 'final'
    ? facts.protectedMainSha === input.mergeSha
    : facts.protectedMainSha === input.baseSha;
}

function defaultVerifyState(input) {
  const headSha = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], OPTIONS).trim();
  const treeSha = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD^{tree}'], OPTIONS).trim();
  const protectedMainSha = execFileSync(
    '/usr/bin/git',
    ['rev-parse', 'origin/main'],
    OPTIONS
  ).trim();
  let baseIsAncestor = false;
  try {
    execFileSync(
      '/usr/bin/git',
      ['merge-base', '--is-ancestor', input.baseSha, input.headSha],
      OPTIONS
    );
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
    'checkpoint telemetry differs from trusted receipts'
  );
  return { verified: true, counters };
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
  const claimedCounters = {
    approvals: count(input.approvals, 'approvals'),
    reFreezes: count(input.reFreezes, 're-freezes'),
    retries: count(input.retries, 'retries'),
    heavyProofs: count(input.heavyProofs, 'heavy proofs'),
    duplicateHeavyProofs: count(input.duplicateHeavyProofs, 'duplicate heavy proofs'),
  };
  must(typeof verifyState === 'function', 'checkpoint state verifier is unavailable');
  const verified = verifyState(input);
  must(
    verified?.verified === true &&
      canonicalJson(verified.counters) === canonicalJson(claimedCounters),
    'checkpoint counters are not bound to verified receipts'
  );
  const { approvals, reFreezes, retries, heavyProofs, duplicateHeavyProofs } = verified.counters;
  must(duplicateHeavyProofs === 0, 'duplicate heavy proof violates the delivery contract');
  must(heavyProofs >= duplicateHeavyProofs, 'heavy proof counts are inconsistent');
  must(Array.isArray(input.scopeDrift), 'scope drift is invalid');
  must(
    input.scopeDrift.every(value => typeof value === 'string' && value.length > 0) &&
      new Set(input.scopeDrift).size === input.scopeDrift.length,
    'scope drift entries are invalid'
  );
  const legalNextAction = compileLegalNextAction(input, approvals, reFreezes, heavyProofs);
  must(
    typeof input.blockerPhase === 'string' && input.blockerPhase.length > 0,
    'blocker phase is invalid'
  );
  if (input.stage === 'authority_hold') {
    must(input.blockerPhase !== 'none', 'authority hold checkpoint requires a blocker phase');
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
      'final checkpoint is missing terminal invariants'
    );
  }
  return {
    schemaVersion: 1,
    stage: input.stage,
    sliceId: input.sliceId,
    baseSha: input.baseSha,
    headSha: input.headSha,
    treeSha: input.treeSha,
    prNumber: input.prNumber,
    mergeSha: input.mergeSha,
    approvals,
    reFreezes,
    retries,
    heavyProofs,
    duplicateHeavyProofs,
    runnerMinutes: nullableMetric(input.runnerMinutes, 'runner minutes'),
    modelCostUsd: nullableMetric(input.modelCostUsd, 'model cost'),
    blockerPhase: input.blockerPhase,
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
