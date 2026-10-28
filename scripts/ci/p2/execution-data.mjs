// Immutable data only. Fresh-run authority stays with runtime/dispatch private WeakMaps.
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
function immutable(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(immutable);
    Object.freeze(value);
  }
  return value;
}
export function retainedExecution(state) {
  const locations = {
    originalTest: 'wrapper.test.original.ts',
    generatedTestTs: 'wrapper.test.source.ts',
    generatedTestJs: 'wrapper.test.mjs',
    registry: '../registry.mjs',
    runner: '../run-suite.mjs',
    sourceFence: '../../source-fence.mjs',
    ordinaryJob: '../../ordinary-job.mjs',
    originalWrapper: 'wrapper.original.ts',
    generatedWrapperTs: 'wrapper.source.ts',
    generatedWrapperJs: 'wrapper.mjs',
    originalRelay: 'relay.original.ts',
    generatedRelayTs: 'relay.source.ts',
    generatedRelayJs: 'relay.mjs',
  };
  let total = 0;
  const sources = Object.fromEntries(
    Object.entries(locations).map(([name, file]) => {
      const bytes = fs.readFileSync(path.join(state.capsuleRoot, file));
      total += bytes.length;
      if (total > 65536) throw Error('Fixed P2 source-control byte cap');
      return [
        name,
        {
          text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
          sha256: createHash('sha256').update(bytes).digest('hex'),
        },
      ];
    })
  );
  return immutable({
    sourceFiles: structuredClone(state.oracle.sourceFiles),
    compilerVersion: state.oracle.compilerVersion,
    esbuildVersion: state.oracle.esbuildVersion,
    vitestVersion: state.oracle.vitestVersion,
    tests: structuredClone(state.oracle.tests),
    mockSpecifiers: [...state.oracle.mockSpecifiers],
    retainedSegments: structuredClone(state.oracle.retainedSegments),
    actualCases: structuredClone(state.observation.cases),
    actualSuites: structuredClone(state.observation.suites),
    wrapperCoverage: structuredClone(state.observation.coverage),
    ordinaryPartition: structuredClone(state.partition),
    sources,
    directFactoryCoverageObserved: false,
    factorySourceControlRelationRequired: true,
    suiteName: state.oracle.suiteName,
    actualExportProjection: structuredClone(state.oracle.actualExportProjection),
  });
}
export function retainedOriginalFactoryExecution(state) {
  const locations = {
    originalTest: 'wrapper.test.original.ts',
    generatedTestTs: 'wrapper.test.source.ts',
    generatedTestJs: 'wrapper.test.mjs',
    registry: '../registry.mjs',
    runner: '../run-suite.mjs',
    sourceFence: '../../source-fence.mjs',
    ordinaryJob: '../../ordinary-job.mjs',
    generatedWrapperJs: 'wrapper.mjs',
  };
  let bytes = 0;
  const sources = Object.fromEntries(
    Object.entries(locations).map(([name, file]) => {
      const text = fs.readFileSync(path.join(state.capsuleRoot, file), 'utf8');
      bytes += Buffer.byteLength(text);
      if (bytes > 65536) throw Error('Original factory source-control byte cap');
      return [name, { text, sha256: createHash('sha256').update(text).digest('hex') }];
    })
  );
  return immutable({
    sourceFiles: structuredClone(state.oracle.sourceFiles),
    compilerVersion: state.oracle.compilerVersion,
    esbuildVersion: state.oracle.esbuildVersion,
    vitestVersion: state.oracle.vitestVersion,
    tests: structuredClone(state.oracle.tests),
    mockSpecifiers: [...state.oracle.mockSpecifiers],
    retainedSegments: structuredClone(state.oracle.retainedSegments),
    actualCases: structuredClone(state.observation.cases),
    actualSuites: structuredClone(state.observation.suites),
    wrapperCoverage: structuredClone(state.observation.coverage),
    ordinaryPartition: structuredClone(state.partition),
    sources,
    directFactoryCoverageObserved: false,
    factorySourceControlRelationRequired: true,
  });
}
