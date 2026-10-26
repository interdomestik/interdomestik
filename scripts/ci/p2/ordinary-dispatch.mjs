import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { runRequiredP2Runtime, withFreshP2Dispatch } from './runtime.mjs';
import { safeEnv, authenticateRuntimeContext } from '../db-access-provider-runtime-identity.mjs';
import { runCoverageGate } from '../coverage-gate.mjs';
import { convertP2Coverage, mergeP2Coverage } from './coverage-adapter.mjs';
import {
  expectedCoverageFiles,
  fetchOrdinaryCoverageArtifact,
  unpackOrdinaryArtifact,
  normalizeOrdinaryCoverage,
  validateSummary,
  parseUntrustedJSON,
} from './ordinary-artifact.mjs';
import { reconcileOrdinaryWebSummary } from './coverage-completeness.mjs';
import { takeP2BootstrapInvocation } from './bootstrap.mjs';
const freshCoverageResults = new WeakMap();
function tracked(gitDir, commit) {
  const raw = execFileSync(
    '/usr/bin/git',
    ['--no-replace-objects', '--git-dir', gitDir, 'ls-tree', '-r', '-z', commit],
    { env: safeEnv, maxBuffer: 16 * 1024 * 1024, timeout: 30000 }
  ).toString('utf8');
  return raw
    .split('\0')
    .filter(Boolean)
    .map(row => /^(100644|100755) blob [a-f0-9]{40}\t(.+)$/u.exec(row))
    .filter(Boolean)
    .map(m => m[2]);
}
// Required workflow calls this pinned parent directly AFTER the separate ordinary
// job. Candidate code is never spawned under this process's host identity.
export async function runRequiredP2Coverage(givenOptions) {
  if (givenOptions?.context?.eventName !== 'pull_request')
    throw Error('Required P2 coverage needs pull_request event');
  takeP2BootstrapInvocation(givenOptions);
  const options = { ...givenOptions, context: structuredClone(givenOptions.context) };
  const {
    candidateRoot,
    producerRoot,
    gitDir,
    context,
    outputRoot,
    ordinaryRunId,
    ordinaryRunAttempt,
  } = options;
  authenticateRuntimeContext(gitDir, context);
  const files = tracked(gitDir, context.candidateCommit);
  const domains = [
    ...new Set(
      files
        .map(file => /^packages\/(domain-[a-z0-9-]+)\/package.json$/u.exec(file)?.[1])
        .filter(Boolean)
    ),
  ].sort();
  const expectedFiles = expectedCoverageFiles(domains);
  const owned = path.join(fs.realpathSync(outputRoot), 'p2-coverage-' + randomUUID());
  fs.mkdirSync(owned, { mode: 0o700 });
  const identity = await fetchOrdinaryCoverageArtifact({
    runId: ordinaryRunId,
    attempt: ordinaryRunAttempt,
    context,
    outputDirectory: path.join(owned, 'download'),
  });
  const extracted = unpackOrdinaryArtifact({
    identity,
    expectedFiles,
    outputDirectory: path.join(owned, 'ordinary'),
    producerRoot,
  });
  const ordinary = normalizeOrdinaryCoverage({
    bytes: fs.readFileSync(path.join(extracted, 'apps/web/coverage/coverage-final.json')),
    candidateRoot,
    allowedSourceFiles: files,
  });
  // The original web denominator is required and reconciled before replacement.
  // Empty web coverage is valid only with its matching explicit empty summary.
  reconcileOrdinaryWebSummary({
    coverage: ordinary,
    candidateRoot,
    summary: parseUntrustedJSON(
      fs.readFileSync(path.join(extracted, 'apps/web/coverage/coverage-summary.json')),
      16 * 1024 * 1024
    ),
  });
  const summaries = new Map(
    expectedFiles
      .filter(file => file.startsWith('packages/') && file.endsWith('/coverage-summary.json'))
      .map(file => [file, validateSummary(fs.readFileSync(path.join(extracted, file)))])
  );
  // Reuse decisions, JSON receipts and ordinary target counters cannot create this
  // fresh authority. Every required invocation executes the capsule again.
  const handle = await runRequiredP2Runtime(options);
  const discoveredSources = files.filter(file => /^apps\/web\/src\/.+\.test\.tsx?$/u.test(file));
  const result = await withFreshP2Dispatch(handle, { context, discoveredSources }, async state => {
    const cap = file => fs.readFileSync(path.join(state.capsuleRoot, file), 'utf8');
    const p2Coverage = await convertP2Coverage({
      observation: state.observation,
      generatedJs: cap('wrapper.mjs'),
      generatedTs: cap('wrapper.source.ts'),
      sourceMap: JSON.parse(cap('wrapper.js.map')),
      originalSource: cap('wrapper.original.ts'),
      retainedSegments: state.oracle.retainedSegments,
      originalPath: path.join(candidateRoot, 'apps/web/src/actions/admin-claims/assign.core.ts'),
    });
    const reportRoot = path.join(owned, 'merged');
    for (const [file, summary] of summaries) {
      const target = path.join(reportRoot, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(summary) + '\n', { flag: 'wx' });
    }
    const merged = mergeP2Coverage({
      ambientCoverage: ordinary,
      p2Coverage,
      outputDirectory: path.join(reportRoot, 'apps/web/coverage'),
    });
    const gate = runCoverageGate({ rootDir: reportRoot, minLinesPct: 60, stdout: false });
    if (!gate.ok) throw Error('Merged ordinary coverage gate failed');
    return Object.freeze({
      version: 1,
      freshP2: true,
      coverageMerged: true,
      ordinaryJob: {
        runId: identity.runId,
        attempt: identity.attempt,
        artifactId: identity.artifactId,
        digest: identity.digest,
        dataIsUntrusted: true,
      },
      ordinarySourcePartition: state.partition,
      imageId: state.imageId,
      reportRoot,
      merged,
      gate,
      ordinaryCoverageNativeCredit: false,
      wholeGuardPass: false,
      nativeAdmission: false,
    });
  });
  freshCoverageResults.set(result, {
    context: JSON.stringify(context),
    consumed: false,
    evidence: Object.freeze({
      sourceBefore: handle.sourceBefore,
      parentBefore: handle.parentBefore,
      imageId: result.imageId,
      ordinaryArtifactDigest: identity.digest,
      dispatchContext: 'required-pr-isolated',
      allSourceContextsClosed: false,
      nativeAdmission: false,
    }),
  });
  return result;
}

// The required M4 join must call this in the same protected parent. A serialized
// receipt, cache result, or already-consumed handle is never source authority.
export function takeFreshP2CoverageForJoin(result, context) {
  if (context?.eventName !== 'pull_request')
    throw Error('Required P2 join needs pull_request event');
  const state = freshCoverageResults.get(result);
  if (!state || state.consumed || state.context !== JSON.stringify(context))
    throw Error('Fresh same-event P2 result required');
  state.consumed = true;
  return state.evidence;
}
