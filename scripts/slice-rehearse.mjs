#!/usr/bin/env node

import path from 'node:path';
import { realpathSync } from 'node:fs';
import process from 'node:process';
import { tmpdir } from 'node:os';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

import {
  assertLocalAnchor,
  gitBytes,
  gitText,
  readLocalAnchor,
  validateRehearsalBootstrap,
} from './slice-rehearse-bootstrap.mjs';

const BUDGET_PATH = 'scripts/repo-size-budget.json';
const MANIFEST_BYTES = 1024 * 1024;
const BUDGET_BYTES = 4 * 1024 * 1024;

const legacyRequire = createRequire(import.meta.url);

export function collectRepositoryFacts(options) {
  return legacyRequire('./slice-rehearse-git-facts.mjs').collectRepositoryFacts(options);
}

function parseArgs(argv) {
  const values = argv.filter(value => value !== '--');
  const diagnostics = values.length === 3 && values[2] === '--diagnostics';
  const args = diagnostics ? values.slice(0, -1) : values;
  if (args.length !== 2 || args[0] !== '--manifest' || !args[1]) {
    throw new Error('Usage: node scripts/slice-rehearse.mjs --manifest <path>');
  }
  return { manifestPath: args[1], diagnostics };
}

function readManifest(manifestPath, cwd, { rehearsalCore, readBoundedRegularText }) {
  let value;
  try {
    value = JSON.parse(
      readBoundedRegularText(path.resolve(cwd, manifestPath), {
        label: 'Manifest evidence',
        maxBytes: MANIFEST_BYTES,
        allowedRoots: [cwd, tmpdir(), '/private/tmp'],
      })
    );
  } catch (error) {
    throw new Error(
      `Manifest evidence is unavailable: ${error instanceof Error ? error.message : error}`
    );
  }
  return rehearsalCore.validateRehearsalManifest(value);
}

function readBudget(repository, { readBoundedRegularText, validateCapacityBudget }) {
  let budget;
  let budgetText;
  try {
    const budgetPath = path.resolve(repository, BUDGET_PATH);
    if (path.relative(repository, budgetPath) !== BUDGET_PATH) {
      throw new Error('Repo-size budget path is not canonical.');
    }
    budgetText = readBoundedRegularText(budgetPath, {
      label: 'Repo-size budget',
      maxBytes: BUDGET_BYTES,
      allowedRoots: [repository],
    });
    budget = JSON.parse(budgetText);
  } catch (error) {
    throw new Error(
      `Repo-size budget evidence is unavailable: ${error instanceof Error ? error.message : error}`
    );
  }
  validateCapacityBudget(budget);
  return { budget, budgetText };
}

function readProtectedBudget(repository, protectedMainSha, validateCapacityBudget) {
  try {
    const bytes = gitBytes(repository, ['show', `${protectedMainSha}:${BUDGET_PATH}`]);
    if (Buffer.byteLength(bytes) > BUDGET_BYTES) {
      throw new Error('Protected repo-size budget exceeds the input size limit.');
    }
    const protectedBudgetText = bytes.toString('utf8');
    const protectedBudget = JSON.parse(protectedBudgetText);
    validateCapacityBudget(protectedBudget);
    return { protectedBudget, protectedBudgetText };
  } catch (error) {
    throw new Error(
      `Protected repo-size budget evidence is unavailable: ${error instanceof Error ? error.message : error}`
    );
  }
}

function readBaselineBudget(repository, protectedMainSha) {
  try {
    return gitBytes(repository, ['show', `${protectedMainSha}:${BUDGET_PATH}`]);
  } catch {
    throw new Error(
      `Baseline budget evidence is unavailable at ${protectedMainSha}:${BUDGET_PATH}.`
    );
  }
}

// The host must verify loader/pin/runtime/dependency provenance outside candidate
// control. This local interface does not install or authenticate that host.
export function runTrustedSliceRehearsal(request, host) {
  const stderr = host?.stderr ?? (value => process.stderr.write(value));
  try {
    if (
      !request ||
      Object.keys(request).some(key => !['cwd', 'manifestPath'].includes(key)) ||
      typeof request.cwd !== 'string' ||
      typeof request.manifestPath !== 'string'
    )
      throw new TypeError('Invalid strict request.');
    if (typeof host?.admit !== 'function') throw new Error('Trusted host admission required.');
    const fixed = Object.freeze({ cwd: request.cwd, manifestPath: request.manifestPath });
    const trustedBootstrap = host.admit(fixed);
    if (!/^[0-9a-f]{40}$/u.test(trustedBootstrap?.policy?.treeSha ?? ''))
      throw new Error('Exact host admission required.');
    return runSliceRehearsal({
      cwd: fixed.cwd,
      argv: ['--manifest', fixed.manifestPath],
      trustedBootstrap,
      stdout: host.stdout,
      stderr,
    });
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : error}\n`);
    return 1;
  }
}

export function runSliceRehearsal({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = value => process.stdout.write(value),
  stderr = value => process.stderr.write(value),
  evaluate,
  readProtectedMain,
  collectVerifiedEvidence,
  collectOperations,
  collectFacts,
  trustedBootstrap,
  readGithub,
} = {}) {
  try {
    // Optional local precursor for a separately installed trusted caller. The
    // ordinary CLI remains legacy; it cannot self-approve or supply this pin.
    const bootstrap =
      trustedBootstrap === undefined ? null : validateRehearsalBootstrap(trustedBootstrap, cwd);
    const requirePolicy = bootstrap
      ? createRequire(path.join(bootstrap.policyRoot, 'scripts/slice-rehearse.mjs'))
      : legacyRequire;
    const rehearsalCore = requirePolicy('./slice-rehearse-core.mjs');
    const { readBoundedRegularText } = requirePolicy('./slice-rehearse-evidence.mjs');
    const { compileWriterClosure } = requirePolicy('./slice-rehearse-capacity.mjs');
    const { projectionCapacityOwnerPaths } = requirePolicy(
      './slice-rehearse-capacity-owner-facts.mjs'
    );
    const { validateCapacityBudget } = requirePolicy('./repo-size-capacity-schema.mjs');
    const { observeLocalState, assertLocalObservation } = requirePolicy(
      './slice-rehearse-git-facts.mjs'
    );
    const { withRemoteReadConsistency } = requirePolicy('./lean-current-authority-git.mjs');
    if (evaluate === undefined)
      evaluate = requirePolicy('./slice-rehearse-evaluator.mjs').evaluateRehearsal;
    if (readProtectedMain === undefined)
      readProtectedMain = requirePolicy('./lean-current-authority-git.mjs').protectedMain;
    if (collectVerifiedEvidence === undefined)
      collectVerifiedEvidence = requirePolicy(
        './slice-rehearse-github-evidence.mjs'
      ).collectVerifiedEvidenceKeys;
    if (collectOperations === undefined)
      collectOperations = requirePolicy(
        './slice-rehearse-operation-facts.mjs'
      ).collectOperationFacts;
    if (collectFacts === undefined)
      collectFacts = requirePolicy('./slice-rehearse-git-facts.mjs').collectRepositoryFacts;
    const policy = { rehearsalCore, readBoundedRegularText, validateCapacityBudget };
    const { manifestPath, diagnostics } = parseArgs(argv);
    const manifest = compileWriterClosure(readManifest(manifestPath, cwd, policy)).manifest;
    const repositoryRoot = realpathSync(gitText(cwd, ['rev-parse', '--show-toplevel']));
    const anchor = bootstrap?.target ?? readLocalAnchor(repositoryRoot);
    if (typeof readProtectedMain !== 'function') {
      throw new TypeError('Protected-main authority adapter is unavailable.');
    }
    let assertObservation;
    const inputs = withRemoteReadConsistency(
      repositoryRoot,
      () => {
        const protectedMainSha = readProtectedMain(repositoryRoot);
        const { protectedBudget, protectedBudgetText } = readProtectedBudget(
          repositoryRoot,
          protectedMainSha,
          validateCapacityBudget
        );
        const observationPaths = [
          ...manifest.writerPaths,
          ...projectionCapacityOwnerPaths(protectedBudget, manifest),
          BUDGET_PATH,
        ];
        const observation = observeLocalState(repositoryRoot, observationPaths);
        assertObservation = () => {
          assertLocalAnchor(repositoryRoot, anchor);
          assertLocalObservation(repositoryRoot, observationPaths, observation);
        };
        const { budget, budgetText } = readBudget(repositoryRoot, policy);
        const baselineBudgetBytes = readBaselineBudget(
          repositoryRoot,
          protectedBudget.baseline.protectedMainSha
        );
        if (typeof evaluate !== 'function')
          throw new TypeError('Rehearsal evaluator is unavailable.');
        const repository = collectFacts({
          cwd: repositoryRoot,
          baseSha: manifest.baseSha,
          budgetBaselineSha: protectedBudget.baseline.protectedMainSha,
          capacityOwnerPaths: projectionCapacityOwnerPaths(protectedBudget, manifest),
          protectedMainSha,
          writerPaths: manifest.writerPaths,
        });
        assertObservation();
        const operationFacts =
          typeof collectOperations === 'function'
            ? collectOperations({
                operations: manifest.routineOperations,
                repository: repository.root,
              })
            : null;
        assertObservation();
        let verifiedEvidenceKeysByLane = {};
        if (typeof collectVerifiedEvidence === 'function') {
          try {
            verifiedEvidenceKeysByLane = collectVerifiedEvidence({
              origin: repository.origin,
              providerRepository: repository.providerRepository,
              headSha: repository.headSha,
              treeSha: repository.treeSha,
              protectedMainSha: repository.protectedMainSha,
              writerPaths: manifest.writerPaths,
              proof: manifest.proof,
              evidenceReceipts: manifest.evidenceReceipts,
              previousProofInputs: repository.previousProofInputsByLane?.['pr-e2e'],
              currentProofInputs: repository.currentProofInputsByLane?.['pr-e2e'],
              repository: repository.root,
            });
          } catch {
            verifiedEvidenceKeysByLane = {};
          }
        }
        assertObservation();
        return {
          manifest,
          repository: { ...repository, operationFacts, verifiedEvidenceKeysByLane },
          budget,
          budgetText,
          protectedBudget,
          protectedBudgetText,
          baselineBudgetBytes: Buffer.byteLength(baselineBudgetBytes),
        };
      },
      readGithub
    );
    assertObservation();
    const report = evaluate(inputs);
    if (!Array.isArray(report.authorityStops)) {
      throw new TypeError('Rehearsal report authority stops are unavailable.');
    }
    const output = diagnostics
      ? requirePolicy('./slice-rehearse-diagnostics.mjs').withRehearsalDiagnostics(report)
      : report;
    stdout(rehearsalCore.canonicalJson(output));
    return report.authorityStops.length > 0 ? 2 : 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : error}\n`);
    return 1;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runSliceRehearsal();
}
