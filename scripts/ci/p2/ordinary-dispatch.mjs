import { retainedExecution, retainedOriginalFactoryExecution } from './execution-data.mjs';
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  runRequiredP2Runtime,
  runRequiredLegacyP2Runtime,
  withFreshP2Dispatch,
  assertP2InputProjectionCurrent,
} from './runtime.mjs';
import { safeEnv, authenticateRuntimeContext } from '../db-access-provider-runtime-identity.mjs';
import { runCoverageGate } from '../coverage-gate.mjs';
import {
  convertP2Coverage,
  convertLegacyP2Coverage,
  mergeP2Coverage,
} from './coverage-adapter.mjs';
import {
  expectedCoverageFiles,
  fetchOrdinaryCoverageArtifact,
  fetchM4C0OrdinaryCoverageArtifact,
  unpackOrdinaryArtifact,
  normalizeOrdinaryCoverage,
  validateSummary,
  parseUntrustedJSON,
} from './ordinary-artifact.mjs';
import { reconcileOrdinaryWebSummary } from './coverage-completeness.mjs';
import { takeP2BootstrapInvocation, takeM4C0BootstrapInvocation } from './bootstrap.mjs';
const freshCoverageResults = new WeakMap();
function immutable(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}
function tracked(gitDir, commit) {
  const raw = execFileSync(
    '/usr/bin/git',
    ['--no-replace-objects', '--git-dir', gitDir, 'ls-tree', '-r', '-z', commit],
    { env: safeEnv, maxBuffer: 16 * 1024 * 1024, timeout: 30000 }
  ).toString('utf8');
  const entries = raw
    .split('\0')
    .filter(Boolean)
    .map(row => /^(100644|100755) blob ([a-f0-9]{40})\t(.+)$/u.exec(row))
    .filter(Boolean);
  return {
    files: entries.map(m => m[3]),
    sourceEntries: Object.fromEntries(entries.map(m => [m[3], { mode: m[1], blob: m[2] }])),
  };
}
// Required workflow calls this pinned parent directly AFTER the separate ordinary
// job. Candidate code is never spawned under this process's host identity.
export async function runRequiredP2Coverage(givenOptions) {
  return runCoverage(givenOptions, 'required');
}
export async function runM4C0P2Coverage(givenOptions) {
  return runCoverage(givenOptions, 'm4-c0');
}
async function runCoverage(givenOptions, purpose) {
  if (givenOptions?.context?.eventName !== 'pull_request')
    throw Error('Required P2 coverage needs pull_request event');
  const invocation =
    purpose === 'required'
      ? takeP2BootstrapInvocation(givenOptions)
      : takeM4C0BootstrapInvocation(givenOptions);
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
  const { files, sourceEntries: trackedSourceEntries } = tracked(gitDir, context.candidateCommit);
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
  const artifactOptions = {
    runId: ordinaryRunId,
    attempt: ordinaryRunAttempt,
    context,
    outputDirectory: path.join(owned, 'download'),
  };
  const identity = await (purpose === 'required'
    ? fetchOrdinaryCoverageArtifact(artifactOptions)
    : fetchM4C0OrdinaryCoverageArtifact(artifactOptions, invocation.artifactAuthority));
  const extracted = unpackOrdinaryArtifact({
    identity,
    expectedFiles,
    outputDirectory: path.join(owned, 'ordinary'),
    producerRoot,
  });
  const coverageContext = { trackedSourceEntries, ordinaryArtifactIdentity: identity };
  const ordinary = normalizeOrdinaryCoverage({
    bytes: fs.readFileSync(path.join(extracted, 'apps/web/coverage/coverage-final.json')),
    candidateRoot,
    allowedSourceFiles: files,
    ...coverageContext,
  });
  // Reconcile the full original denominator, including an explicitly matched empty summary.
  reconcileOrdinaryWebSummary({
    coverage: ordinary,
    candidateRoot,
    ...coverageContext,
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
  // The first backend returns only after its real cleanup. No bank containers overlap.
  const originalFactoryHandle = await runRequiredLegacyP2Runtime(options);
  let originalFactoryExecution, originalFactoryImageId, originalFactoryMerged;
  await withFreshP2Dispatch(
    originalFactoryHandle,
    {
      context,
      discoveredSources: files.filter(file => /^apps\/web\/src\/.+\.test\.tsx?$/u.test(file)),
    },
    async state => {
      originalFactoryExecution = retainedOriginalFactoryExecution(state);
      originalFactoryImageId = state.imageId;
      const cap = file => fs.readFileSync(path.join(state.capsuleRoot, file), 'utf8');
      const converted = await convertLegacyP2Coverage({
        observation: state.observation,
        generatedJs: cap('wrapper.mjs'),
        generatedTs: cap('wrapper.source.ts'),
        sourceMap: JSON.parse(cap('wrapper.js.map')),
        originalSource: cap('wrapper.original.ts'),
        retainedSegments: state.oracle.retainedSegments,
        originalPath: path.join(candidateRoot, 'apps/web/src/actions/admin-claims/assign.core.ts'),
      });
      originalFactoryMerged = mergeP2Coverage({
        ambientCoverage: ordinary,
        ...coverageContext,
        p2Coverage: converted,
        outputDirectory: path.join(owned, 'original-factory-merged'),
      });
    }
  );
  const discoveredSources = files.filter(file => /^apps\/web\/src\/.+\.test\.tsx?$/u.test(file));
  let execution;
  const result = await withFreshP2Dispatch(handle, { context, discoveredSources }, async state => {
    const cap = file => fs.readFileSync(path.join(state.capsuleRoot, file), 'utf8');
    const p2Coverage = await convertP2Coverage({
      observation: state.observation,
      generatedJs: cap('wrapper.mjs'),
      generatedTs: cap('wrapper.source.ts'),
      sourceMap: JSON.parse(cap('wrapper.js.map')),
      originalSource: cap('wrapper.original.ts'),
      retainedSegments: state.oracle.retainedSegments,
      originalPath: path.join(
        candidateRoot,
        'apps/web/src/server/operations/m4-qualification-admin-assignment.ts'
      ),
    });
    execution = retainedExecution(state);
    const reportRoot = path.join(owned, 'merged');
    for (const [file, summary] of summaries) {
      const target = path.join(reportRoot, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, JSON.stringify(summary) + '\n', { flag: 'wx' });
    }
    const merged = mergeP2Coverage({
      ambientCoverage: originalFactoryMerged.coverageMap,
      ...coverageContext,
      p2Coverage,
      outputDirectory: path.join(reportRoot, 'apps/web/coverage'),
    });
    const gate = runCoverageGate({ rootDir: reportRoot, minLinesPct: 60, stdout: false });
    if (!gate.ok) throw Error('Merged ordinary coverage gate failed');
    return Object.freeze({
      version: 1,
      freshP2: true,
      freshOriginalFactoryP2: true,
      fixedCaseCount: 19,
      ...(purpose === 'm4-c0'
        ? {
            qualificationPurpose: 'm4-c0',
            hostedProtectedAuthorityAccepted: false,
            globalGuardVerdictAccepted: false,
            productionCCredit: 0,
            workflowFailureNotDeliveryAccepted: true,
            ordinaryWorkflowStatus: identity.workflowStatus,
            ordinaryWorkflowConclusion: identity.workflowConclusion,
          }
        : {}),
      coverageMerged: true,
      ordinaryJob: {
        runId: identity.runId,
        attempt: identity.attempt,
        artifactId: identity.artifactId,
        digest: identity.digest,
        ...(purpose === 'm4-c0'
          ? {
              workflowStatus: identity.workflowStatus,
              workflowConclusion: identity.workflowConclusion,
            }
          : {}),
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
    purpose,
    consumed: false,
    assertInputCurrent() {
      assertP2InputProjectionCurrent(handle, context);
      assertP2InputProjectionCurrent(originalFactoryHandle, context);
    },
    evidence: Object.freeze({
      sourceBefore: handle.sourceBefore,
      parentBefore: handle.parentBefore,
      imageId: result.imageId,
      ordinaryArtifactDigest: identity.digest,
      dispatchContext: 'required-pr-isolated',
      ...(purpose === 'm4-c0'
        ? {
            qualificationPurpose: 'm4-c0',
            hostedProtectedAuthorityAccepted: false,
            globalGuardVerdictAccepted: false,
            productionCCredit: 0,
            workflowFailureNotDeliveryAccepted: true,
            ordinaryWorkflowStatus: identity.workflowStatus,
            ordinaryWorkflowConclusion: identity.workflowConclusion,
          }
        : {}),
      execution,
      originalFactoryBank: immutable({
        kind: 'fresh-original-admin-factory-nine',
        imageId: originalFactoryImageId,
        inputProjection: originalFactoryHandle.inputProjection,
        sourceBefore: originalFactoryHandle.sourceBefore,
        parentBefore: originalFactoryHandle.parentBefore,
        sourceContext: JSON.stringify(context),
        ordinaryArtifactDigest: identity.digest,
        execution: originalFactoryExecution,
        directFactoryCoverageObserved: false,
        productionCCredit: 0,
        nativeAdmission: false,
      }),
      allSourceContextsClosed: false,
      nativeAdmission: false,
    }),
  });
  return result;
}

// The required M4 join must call this in the same protected parent. A serialized
// receipt, cache result, or already-consumed handle is never source authority.
export function takeFreshP2CoverageForJoin(result, context) {
  return takeFreshResult(result, context, 'required');
}
export function takeFreshM4C0CoverageForJoin(result, context) {
  return takeFreshResult(result, context, 'm4-c0');
}
function takeFreshResult(result, context, purpose) {
  if (context?.eventName !== 'pull_request')
    throw Error('Required P2 join needs pull_request event');
  const state = freshCoverageResults.get(result);
  if (
    !state ||
    state.purpose !== purpose ||
    state.consumed ||
    state.context !== JSON.stringify(context)
  )
    throw Error('Fresh same-event P2 result required');
  state.consumed = true;
  state.assertInputCurrent();
  return state.evidence;
}
