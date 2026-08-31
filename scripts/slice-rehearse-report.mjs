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
import { resolveGhBinary } from './slice-rehearse-operation-live.mjs';

const SHA40 = /^[0-9a-f]{40}$/u;
const KEYS = [
  'approvals',
  'baseSha',
  'blockerPhase',
  'duplicateHeavyProofs',
  'headSha',
  'heavyProofs',
  'legalNextActions',
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

const SAFE_EXEC = Object.freeze({
  encoding: 'utf8',
  env: { PATH: '/usr/bin:/bin:/usr/sbin:/sbin' },
  maxBuffer: 8 * 1024 * 1024,
  timeout: 5 * 60_000,
});

function defaultVerifyState(input) {
  const headSha = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD'], SAFE_EXEC).trim();
  const treeSha = execFileSync('/usr/bin/git', ['rev-parse', 'HEAD^{tree}'], SAFE_EXEC).trim();
  const baseSha = execFileSync(
    '/usr/bin/git',
    ['rev-parse', 'refs/remotes/origin/main^{commit}'],
    SAFE_EXEC
  ).trim();
  if (headSha !== input.headSha || treeSha !== input.treeSha || baseSha !== input.baseSha)
    return false;
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
        SAFE_EXEC
      )
    );
    if (pull.headRefOid !== input.headSha || pull.baseRefName !== 'main') return false;
    if (
      input.stage === 'final' &&
      (pull.state !== 'MERGED' || pull.mergeCommit?.oid !== input.mergeSha)
    )
      return false;
  }
  if (['authority_hold', 'final'].includes(input.stage)) {
    const authority = resolveAtAuthorityBoundary({
      boundary: input.stage === 'final' ? 'post_merge' : 'candidate_freeze',
      readLiveAuthority: () =>
        authenticateResolverOutput(resolveRepositoryAuthority(process.cwd(), true)),
    }).authority;
    if (authority.runtimeAuthorized !== false || authority.activeSlice !== null) return false;
  }
  return true;
}

export function generateSliceCheckpoint(input, { verifyState = defaultVerifyState } = {}) {
  exactKeys(input, KEYS, 'slice checkpoint input');
  must(input.schemaVersion === 1, 'checkpoint schema is invalid');
  must(/^[A-Z0-9][A-Z0-9-]+$/u.test(input.sliceId), 'checkpoint slice is invalid');
  must(
    ['checkpoint', 'authority_hold', 'final'].includes(input.stage),
    'checkpoint stage is invalid'
  );
  must(SHA40.test(input.baseSha), 'base SHA is invalid');
  must(SHA40.test(input.headSha), 'head SHA is invalid');
  must(SHA40.test(input.treeSha), 'tree SHA is invalid');
  must(input.mergeSha === null || SHA40.test(input.mergeSha), 'merge SHA is invalid');
  must(
    input.prNumber === null || (Number.isSafeInteger(input.prNumber) && input.prNumber > 0),
    'PR number is invalid'
  );
  const approvals = count(input.approvals, 'approvals');
  const reFreezes = count(input.reFreezes, 're-freezes');
  const retries = count(input.retries, 'retries');
  const heavyProofs = count(input.heavyProofs, 'heavy proofs');
  const duplicateHeavyProofs = count(input.duplicateHeavyProofs, 'duplicate heavy proofs');
  must(duplicateHeavyProofs === 0, 'duplicate heavy proof violates the delivery contract');
  must(heavyProofs >= duplicateHeavyProofs, 'heavy proof counts are inconsistent');
  must(Array.isArray(input.scopeDrift), 'scope drift is invalid');
  must(
    input.scopeDrift.every(value => typeof value === 'string' && value.length > 0) &&
      new Set(input.scopeDrift).size === input.scopeDrift.length,
    'scope drift entries are invalid'
  );
  must(
    Array.isArray(input.legalNextActions) && input.legalNextActions.length === 1,
    'checkpoint requires one legal next action'
  );
  const legalNextAction = input.legalNextActions[0];
  must(
    typeof legalNextAction === 'string' && legalNextAction.length > 0,
    'legal next action is invalid'
  );
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
  must(
    typeof verifyState === 'function' && verifyState(input) === true,
    'checkpoint is not bound to verified repository facts'
  );
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
