#!/usr/bin/env node
import { spawnSync } from 'node:child_process';
import { existsSync, lstatSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

import { protectedMain } from './lean-current-authority-git.mjs';
import { trustedRunnerFile } from './ci/trusted-runner-file.mjs';
import { resolveRepositoryAuthority } from './lean-current-authority.mjs';
import * as canonical from './slice-rehearse-canonical.mjs';
import {
  authenticateResolverOutput,
  resolveAtAuthorityBoundary,
} from './slice-rehearse-authority-boundary.mjs';
import { gitBytes, gitText } from './slice-rehearse-git-facts.mjs';
import { derivePrE2eProofIdentity } from './slice-rehearse-github-evidence.mjs';
import { initializeRehearsalManifest } from './slice-rehearse-init.mjs';

function existsAtBase(root, baseSha, path) {
  return (
    spawnSync('/usr/bin/git', ['-C', root, 'cat-file', '-e', `${baseSha}:${path}`], {
      stdio: 'ignore',
    }).status === 0
  );
}

function capacityDelta(root, baselineSha, path) {
  const currentPath = resolve(root, path);
  let currentBytes = 0;
  if (existsSync(currentPath)) {
    const current = lstatSync(currentPath, { bigint: true });
    canonical.must(current.isFile(), `writer path is not a regular file: ${path}`);
    currentBytes = Number(current.size);
  }
  let baselineBytes = 0;
  try {
    baselineBytes = gitBytes(root, ['show', `${baselineSha}:${path}`]).byteLength;
  } catch {
    baselineBytes = 0;
  }
  return Math.max(0, currentBytes - baselineBytes);
}

function preflightFactRequest(request) {
  const writerPaths = Array.isArray(request?.writerPaths)
    ? canonical.sortedUnique(request.writerPaths, 'writer path', canonical.safeRelativePath)
    : [];
  return { ...request, writerPaths };
}
export function collectManifestInitFacts(request, cwd = process.cwd()) {
  request = preflightFactRequest(request);
  const root = gitText(cwd, ['rev-parse', '--show-toplevel']);
  const authority =
    request.workClass === 'product'
      ? resolveAtAuthorityBoundary({
          boundary: 'pre_work',
          readLiveAuthority: () =>
            authenticateResolverOutput(resolveRepositoryAuthority(root, true)),
        }).authority
      : null;
  const auditedBaseSha = request.auditedBaseSha;
  if (auditedBaseSha !== undefined) {
    canonical.must(/^[0-9a-f]{40}$/u.test(auditedBaseSha), 'audited base SHA is invalid');
    canonical.must(
      gitText(root, ['rev-parse', 'origin/main']) === auditedBaseSha,
      'audited base SHA differs from origin/main'
    );
  }
  const baseSha = auditedBaseSha ?? protectedMain(root);
  const headSha = gitText(root, ['rev-parse', 'HEAD']);
  const proofIdentity = derivePrE2eProofIdentity({ repository: root, commitSha: headSha });
  const budget = JSON.parse(
    gitBytes(root, ['show', `${baseSha}:scripts/repo-size-budget.json`]).toString('utf8')
  );
  const capacityOwner = budget.allocations?.find(item => item.id === request.capacityOwnerId);
  const capacityDeltasByPath = Object.fromEntries(
    (request.writerPaths ?? []).map(path => [
      path,
      capacityDelta(root, budget.baseline.protectedMainSha, path),
    ])
  );
  return {
    baseSha,
    origin: gitText(root, ['config', '--get', 'remote.origin.url']),
    existingPaths: (request.writerPaths ?? []).filter(path => existsAtBase(root, baseSha, path)),
    proofCommands: proofIdentity.commands,
    workflowDigest: proofIdentity.workflowDigest,
    substrateDigest: proofIdentity.substrateDigest,
    existingCapacityCapsByPath: capacityOwner?.maxPathBytesDelta ?? {},
    capacityDeltasByPath,
    authority,
  };
}

function parseArgs(argv) {
  if (
    ![2, 4].includes(argv.length) ||
    argv[0] !== '--request' ||
    !argv[1] ||
    (argv.length === 4 && (argv[2] !== '--output' || !argv[3]))
  ) {
    throw new Error('usage: --request <path> [--output <path>]');
  }
  return { requestPath: argv[1], outputPath: argv[3] ?? null };
}

function writeManifestOutput(outputPath, content, cwd) {
  const target = resolve(cwd, outputPath);
  const roots = [cwd, tmpdir(), '/private/tmp'].map(root => resolve(root));
  const trustedRoot = roots
    .toSorted((left, right) => right.length - left.length)
    .find(root => target.startsWith(`${root}${sep}`));
  canonical.must(trustedRoot, 'manifest output must stay inside a trusted root');
  const trustedPath = trustedRunnerFile(target, { runnerTemp: trustedRoot });
  writeFileSync(trustedPath, content, { encoding: 'utf8', flag: 'wx', mode: 0o600 });
}

export function runManifestInitializer({
  argv = process.argv.slice(2),
  cwd = process.cwd(),
  readRequest = path =>
    JSON.parse(
      canonical.readBoundedRegularText(resolve(cwd, path), {
        label: 'Manifest initialization request',
        maxBytes: 128 * 1024,
        allowedRoots: [cwd, tmpdir(), '/private/tmp'],
      })
    ),
  collectFacts = collectManifestInitFacts,
  writeOutput = writeManifestOutput,
  stdout = value => process.stdout.write(value),
  stderr = value => process.stderr.write(value),
} = {}) {
  try {
    const { requestPath, outputPath } = parseArgs(argv);
    const request = preflightFactRequest(readRequest(requestPath));
    const manifest = initializeRehearsalManifest(request, collectFacts(request, cwd));
    const content = canonical.canonicalJson(manifest);
    if (outputPath) writeOutput(outputPath, content, cwd);
    else stdout(content);
    return 0;
  } catch (error) {
    stderr(`manifest initialization failed: ${error.message}\n`);
    return 1;
  }
}

if (resolve(process.argv[1] ?? '') === fileURLToPath(import.meta.url)) {
  process.exitCode = runManifestInitializer();
}
