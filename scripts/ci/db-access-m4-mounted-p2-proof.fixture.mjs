// Explicit current source/host-observation data double; no fresh protected P2 handle exists here.
import fs from 'node:fs';
import { createHash } from 'node:crypto';
export function mountedP2ExecutionFixture() {
  const contract = JSON.parse(
    fs.readFileSync(new URL('./db-access-m4-mounted-p2-proof-contract.json', import.meta.url))
  );
  const oracle = JSON.parse(
    fs.readFileSync(new URL('./p2/dist/source-manifest.json', import.meta.url))
  );
  const raw = JSON.parse(
    fs.readFileSync(new URL('./tests/p2/dist/local-coverage-observation.json', import.meta.url))
  );
  const sources = Object.fromEntries(
    Object.entries(contract.pins).map(([name, pin]) => {
      const text = fs.readFileSync(new URL('../../' + pin.file, import.meta.url), 'utf8');
      return [name, { text, sha256: createHash('sha256').update(text).digest('hex') }];
    })
  );
  return {
    sourceFiles: oracle.sourceFiles,
    compilerVersion: oracle.compilerVersion,
    esbuildVersion: oracle.esbuildVersion,
    vitestVersion: oracle.vitestVersion,
    tests: oracle.tests,
    mockSpecifiers: oracle.mockSpecifiers,
    retainedSegments: oracle.retainedSegments,
    actualCases: raw.cases.map(({ name, state }) => ({ name, state })),
    actualSuites: raw.suites.map(({ name, state }) => ({ name, state })),
    wrapperCoverage: raw.coverage,
    ordinaryPartition: { capsule: [contract.sourceFile], ambient: [] },
    sources,
    directFactoryCoverageObserved: false,
    factorySourceControlRelationRequired: true,
    suiteName: oracle.suiteName,
    actualExportProjection: oracle.actualExportProjection,
  };
}
