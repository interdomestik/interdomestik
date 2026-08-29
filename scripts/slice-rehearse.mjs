#!/usr/bin/env node

import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import * as rehearsalCore from './slice-rehearse-core.mjs';
import { protectedMain } from './lean-current-authority-git.mjs';
import { readBoundedRegularText } from './slice-rehearse-evidence.mjs';
import { projectionCapacityOwnerPaths } from './slice-rehearse-capacity-owner-facts.mjs';
import { evaluateRehearsal } from './slice-rehearse-evaluator.mjs';
import { collectVerifiedEvidenceKeys } from './slice-rehearse-github-evidence.mjs';
import { collectOperationFacts } from './slice-rehearse-operation-facts.mjs';
import { collectRepositoryFacts, gitBytes, gitText } from './slice-rehearse-git-facts.mjs';
import { validateCapacityBudget } from './repo-size-capacity-schema.mjs';

const BUDGET_PATH = 'scripts/repo-size-budget.json';
const MAX_MANIFEST_BYTES = 1024 * 1024;
const MAX_BUDGET_BYTES = 4 * 1024 * 1024;

export { collectRepositoryFacts } from './slice-rehearse-git-facts.mjs';

function parseArgs(argv) {
  const args = argv.filter(value => value !== '--');
  if (args.length !== 2 || args[0] !== '--manifest' || !args[1]) {
    throw new Error('Usage: node scripts/slice-rehearse.mjs --manifest <path>');
  }
  return { manifestPath: args[1] };
}

function readManifest(manifestPath, cwd) {
  let value;
  try {
    value = JSON.parse(
      readBoundedRegularText(path.resolve(cwd, manifestPath), {
        label: 'Manifest evidence',
        maxBytes: MAX_MANIFEST_BYTES,
      })
    );
  } catch (error) {
    throw new Error(
      `Manifest evidence is unavailable: ${error instanceof Error ? error.message : error}`
    );
  }
  return rehearsalCore.validateRehearsalManifest(value);
}

function readBudget(repository) {
  let budget;
  let budgetText;
  try {
    const budgetPath = path.resolve(repository, BUDGET_PATH);
    if (path.relative(repository, budgetPath) !== BUDGET_PATH) {
      throw new Error('Repo-size budget path is not canonical.');
    }
    budgetText = readBoundedRegularText(budgetPath, {
      label: 'Repo-size budget',
      maxBytes: MAX_BUDGET_BYTES,
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

function readProtectedBudget(repository, protectedMainSha) {
  try {
    const bytes = gitBytes(repository, ['show', `${protectedMainSha}:${BUDGET_PATH}`]);
    if (Buffer.byteLength(bytes) > MAX_BUDGET_BYTES) {
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

export function runSliceRehearsal({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  stdout = value => process.stdout.write(value),
  stderr = value => process.stderr.write(value),
  evaluate = evaluateRehearsal,
  readProtectedMain = protectedMain,
  collectVerifiedEvidence = collectVerifiedEvidenceKeys,
  collectOperations = collectOperationFacts,
} = {}) {
  try {
    const { manifestPath } = parseArgs(argv);
    const manifest = readManifest(manifestPath, cwd);
    const repositoryRoot = gitText(cwd, ['rev-parse', '--show-toplevel']);
    if (typeof readProtectedMain !== 'function') {
      throw new Error('Protected-main authority adapter is unavailable.');
    }
    const protectedMainSha = readProtectedMain(repositoryRoot);
    const { budget, budgetText } = readBudget(repositoryRoot);
    const { protectedBudget, protectedBudgetText } = readProtectedBudget(
      repositoryRoot,
      protectedMainSha
    );
    const baselineBudgetBytes = readBaselineBudget(
      repositoryRoot,
      protectedBudget.baseline.protectedMainSha
    );
    if (typeof evaluate !== 'function') throw new Error('Rehearsal evaluator is unavailable.');
    const repository = collectRepositoryFacts({
      cwd: repositoryRoot,
      baseSha: manifest.baseSha,
      budgetBaselineSha: protectedBudget.baseline.protectedMainSha,
      capacityOwnerPaths: projectionCapacityOwnerPaths(protectedBudget, manifest),
      protectedMainSha,
      writerPaths: manifest.writerPaths,
    });
    const operationFacts =
      typeof collectOperations === 'function'
        ? collectOperations({
            operations: manifest.routineOperations,
            repository: repository.root,
          })
        : null;
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
          repository: repository.root,
        });
      } catch {
        verifiedEvidenceKeysByLane = {};
      }
    }
    const report = evaluate({
      manifest,
      repository: { ...repository, operationFacts, verifiedEvidenceKeysByLane },
      budget,
      budgetText,
      protectedBudget,
      protectedBudgetText,
      baselineBudgetBytes: Buffer.byteLength(baselineBudgetBytes),
    });
    if (!Array.isArray(report.authorityStops)) {
      throw new Error('Rehearsal report authority stops are unavailable.');
    }
    stdout(rehearsalCore.canonicalJson(report));
    return report.authorityStops.length > 0 ? 2 : 0;
  } catch (error) {
    stderr(`${error instanceof Error ? error.message : error}\n`);
    return 1;
  }
}

if (path.resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runSliceRehearsal();
}
