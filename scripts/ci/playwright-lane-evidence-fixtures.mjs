import { createHash } from 'node:crypto';

export const HEAD = 'a'.repeat(40);
export const SPEC = 'e2e/gate/public-header-overflow.spec.ts';
export const PROJECTS = ['gate-ks-sq', 'gate-mk-contract', 'gate-mk-mk'];

export function passingTest(projectName) {
  return {
    expectedStatus: 'passed',
    projectId: projectName,
    projectName,
    results: [{ retry: 0, status: 'passed' }],
    status: 'expected',
  };
}

export function makeReport() {
  return {
    config: { projects: PROJECTS.map(name => ({ id: name, name })) },
    suites: [
      {
        file: 'gate/public-header-overflow.spec.ts',
        specs: [
          {
            file: 'gate/public-header-overflow.spec.ts',
            id: 'spec-a',
            tags: [],
            tests: PROJECTS.map(passingTest),
          },
          {
            file: 'gate/public-header-overflow.spec.ts',
            id: 'spec-b',
            tags: [],
            tests: [passingTest('gate-ks-sq')],
          },
        ],
      },
    ],
  };
}

export function encode(report = makeReport()) {
  return Buffer.from(JSON.stringify(report));
}

export function expectedSummary(reportBytes = encode()) {
  return {
    schemaVersion: 1,
    headSha: HEAD,
    lane: 'pr-gate',
    status: 'pass',
    projects: PROJECTS,
    specs: [SPEC],
    total: 4,
    retryRecovered: [],
    quarantined: [],
    reportSha256: createHash('sha256').update(reportBytes).digest('hex'),
  };
}
