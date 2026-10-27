// Explicit pure-unit doubles of the private execution data; no live P2 handle exists here.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
export const hash = value => createHash('sha256').update(value).digest('hex');
export function executionFixture() {
  const read = path => fs.readFileSync(new URL('../../' + path, import.meta.url), 'utf8');
  const oracle = JSON.parse(read('scripts/ci/p2/dist/source-manifest.json'));
  const contract = JSON.parse(read('scripts/ci/db-access-m4-factory-contract.json'));
  const names = {
    originalTest: 'originalTest',
    generatedTestTs: 'generatedTestSource',
    generatedTestJs: 'generatedTest',
    registry: 'registry',
    runner: 'runSuite',
    sourceFence: 'sourceFence',
    ordinaryJob: 'ordinaryJob',
    generatedWrapperJs: 'generatedWrapper',
  };
  const sources = Object.fromEntries(
    Object.entries(names).map(([key, name]) => {
      const text = read(contract.pins[name].file);
      return [key, { text, sha256: hash(text) }];
    })
  );
  return {
    ...oracle,
    sources,
    actualCases: oracle.tests.map(test => ({
      name: test.name,
      state: 'pass',
    })),
    actualSuites: [
      { name: 'wrapper.test.mjs', state: 'pass' },
      { name: 'assignClaimCore (Wrapper Means)', state: 'pass' },
    ],
    ordinaryPartition: {
      capsule: ['apps/web/src/actions/admin-claims/assign.wrapper.test.ts'],
      ambient: [],
    },
    directFactoryCoverageObserved: false,
    factorySourceControlRelationRequired: true,
  };
}

// Explicit pure data double, using the closed original cohort only for conservation.
import * as sourceRule from './db-access-m4-factory-source-rule.mjs';
import { lineageObservationKey } from './db-access-m4-factory-context-rule.mjs';
export function acceptanceFixture() {
  const closed = JSON.parse(
    fs.readFileSync(
      new URL('./db-access-m4-private-cohort.test-fixture.json', import.meta.url),
      'utf8'
    )
  );
  // Retain original observation order across the runtime/consumer data partitions.
  closed.observations = ['runtime', 'consumer']
    .flatMap(group =>
      JSON.parse(
        fs.readFileSync(
          new URL(`./db-access-m4-private-${group}-contexts.test-fixture.json`, import.meta.url),
          'utf8'
        )
      )
    )
    .sort((a, b) => a.index - b.index)
    .map(row => row.observation);
  const execution = executionFixture(),
    construction = sourceRule.deriveFixedFactoryConstruction(execution);
  const event = {
    context: {
      eventName: 'pull_request',
      sourceCommit: 'unit-source',
      candidateCommit: 'unit-merge',
    },
  };
  const runtime = {
    contextSha256: hash(JSON.stringify(event.context)),
    policySha256: hash('policy'),
    imageDigest: hash('sql-image'),
    reportSha256: hash('sql-report'),
  };
  const ordinary = {
    sourceContext: JSON.stringify(event.context),
    providerPolicySha256: runtime.policySha256,
    dispatchContext: 'required-pr-isolated',
    imageId: hash('ordinary-image'),
    ordinaryArtifactDigest: hash('ordinary-artifact'),
    sourceBefore: hash('candidate'),
    parentBefore: hash('producer'),
    execution,
  };
  const originalIds = [...closed.selectedIdentities],
    entries = originalIds.map(identity => ({ row: { identity } }));
  const selected = [],
    source = construction.factories[0].sourceFile;
  for (const factory of construction.factories) {
    const index = entries.length;
    entries.push({
      row: {
        identity: factory.identity,
        file: source,
        method: 'escape',
        source: factory.returnText,
        reason: 'unsupported returned handle analysis bound, cycle or mutated value',
      },
      owner: factory.owner,
      incomplete: true,
      indirect: false,
    });
    selected.push({
      inventoryIndex: index,
      identity: factory.identity,
      owner: factory.owner,
      operation: factory.operation,
    });
  }
  const roots = [...closed.roots],
    chunk = Math.ceil(roots.length / 4);
  const batches = Array.from({ length: 4 }, (_, index) => ({
    roots: roots.slice(index * chunk, (index + 1) * chunk),
    observations: [],
    frames: [],
    entryEmissions: [],
  }));
  const batch = batches.find(batch => batch.roots.includes(source));
  if (!batch) throw Error('closed native root must contain exact fixed P2 source');
  for (const [i, factory] of construction.factories.entries()) {
    const row = {
      origin: source,
      owner: factory.owner,
      invocation: null,
      context: null,
      definingContext: null,
      outcome: 'visited',
      inventoryIndices: [selected[i].inventoryIndex],
      memberships: [{ family: 'two-returned-mock-factories', side: 'retained' }],
      dispatchClassification: 'no-additional-state-query',
      occurrences: i + 2,
    };
    batch.observations.push(row);
    batch.entryEmissions.push({
      observationKey: lineageObservationKey(row),
      inventoryIndex: selected[i].inventoryIndex,
      identity: factory.identity,
      origin: source,
      kind: 'entry-incomplete',
      reason: entries[selected[i].inventoryIndex].row.reason,
      occurrences: i + 2,
    });
  }
  const native = {
    sourcePolicyDigest: hash('source-policy'),
    eventBinding: { contextSha256: runtime.contextSha256 },
    inventory: { entries },
    rawGraph: {
      m4Contexts: {
        roots,
        selectedIdentities: originalIds,
        observations: structuredClone(closed.observations),
        affectedLineage: { selection: { entries: selected }, batches },
      },
    },
    raw: {
      failures: entries.map(entry => ({ identity: entry.row.identity })),
      diagnostics: [
        {
          file: source,
          reason: entries[selected[0].inventoryIndex].row.reason,
          occurrences: 5,
        },
        { file: 'outside.ts', reason: 'retained unrelated', occurrences: 7 },
      ],
      diagnosticCount: 12,
    },
  };
  const relation = {
    sourcePolicyDigest: native.sourcePolicyDigest,
    contextSha256: runtime.contextSha256,
    runtimeReportSha256: runtime.reportSha256,
    imageDigest: runtime.imageDigest,
  };
  const effectAssertions = { ...relation, localPremises: { ...relation } };
  const workerLoaderInspection = {
    scope: 'LOADER_ONLY_LOCAL',
    slots: 'explicit unit double, no actual Workers',
  };
  return {
    effectAssertions,
    workerLoaderInspection,
    native,
    nativeOutputDigest: hash('native-owned-output-unit-double'),
    runtime,
    ordinary,
    event,
  };
}
