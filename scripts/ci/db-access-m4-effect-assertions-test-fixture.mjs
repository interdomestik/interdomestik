import { createHash } from 'node:crypto';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { M4_KERNEL_ASSERTION_FILE } from './db-access-m4-kernel-assertion-contract.mjs';
import { M4_RUNTIME_CONTRACT } from './db-access-m4-runtime-contract.mjs';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { deriveM4AssignmentKernel } from './db-access-m4-source.mjs';

const hash = value => createHash('sha256').update(value).digest('hex');
const kernelFile = 'apps/web/src/features/admin/claims/actions/ops-assignment.ts';

// Complete pure data for the isolated owner-double test. It neither creates nor
// substitutes native/runtime authority; the test still exercises the real joins.
export function createM4EffectAssertionOwnerFixture() {
  const root = fileURLToPath(new URL('../..', import.meta.url));
  const bundleSha256 = hash('unit runtime bundle');
  const sourceBookend = hash('unit source bookend');
  const event = { context: {} };
  const runtime = {
    completion: {
      privateCaseIds: [...M4_RUNTIME_CONTRACT.caseIDs.private],
      profileCaseIds: [...M4_RUNTIME_CONTRACT.caseIDs.profiles],
      completionValidated: true,
    },
    reportSha256: hash('unit report'),
    contextSha256: hash(JSON.stringify(event.context)),
    imageDigest: hash('unit image'),
    bundleSha256,
    metafileSha256: hash('normalized unit metafile'),
    policySha256: hash('unit runtime policy'),
    dependencyGraphSha256: hash('unit dependency graph'),
    fixedContractSha256: hash(JSON.stringify(M4_RUNTIME_CONTRACT)),
    minimalOpsPrivilegeDiagnostic: {
      expectedMinimalGrants: true,
      positiveRows: 1,
      forbiddenBranchSelectSqlstate: '42501',
      roleGrantExpansion: false,
    },
  };
  const records = {
    ...M4_RUNTIME_CONTRACT.files,
    ...M4_RUNTIME_CONTRACT.configuration,
    ...M4_RUNTIME_CONTRACT.migrations,
    [kernelFile]: PROVIDER_UNIT_POLICY.m4Proof.sources[kernelFile],
    [M4_KERNEL_ASSERTION_FILE]:
      PROVIDER_UNIT_POLICY.producerFiles['scripts/ci/' + M4_KERNEL_ASSERTION_FILE],
    'db-access-m4-runtime-fixture.mjs':
      PROVIDER_UNIT_POLICY.producerFiles['scripts/ci/db-access-m4-runtime-fixture.mjs'],
    'm4-runtime.cjs': { sha256: bundleSha256, bytes: 0 },
    'm4-runtime-metafile.json': { sha256: hash('unit metafile bytes'), bytes: 0 },
  };
  const source = {
    policyDigest: hash('unit source policy'),
    sourceRecords: PROVIDER_UNIT_POLICY.m4Proof.sources,
    bookends: { before: sourceBookend, after: sourceBookend },
    derivations: {
      kernel: deriveM4AssignmentKernel(fs.readFileSync(root + '/' + kernelFile, 'utf8')),
      controller: {},
      identity: {},
      notification: {},
      assignmentKernels: {},
      privateRuntime: {},
    },
  };
  const selection = {
    version: 1,
    catalogDataSha256: hash('unit lineage catalog'),
    sites: [],
    entries: [],
    ownerEnvelopeSelection: true,
    unresolvedFrontierFiles: [],
    acceptedCoverage: 0,
    runtimeAdmission: false,
    allExecutableContextsQualified: false,
  };
  const native = {
    inventory: { entries: [] },
    raw: { failures: [], diagnostics: [], diagnosticCount: 0 },
    rawGraph: {
      m4Contexts: {
        affectedLineage: {
          catalogDataSha256: selection.catalogDataSha256,
          selection,
          batches: [],
        },
        observations: [],
        selectedIdentities: [],
      },
    },
  };
  const copiedInputCount = Object.keys({
    ...M4_RUNTIME_CONTRACT.files,
    ...M4_RUNTIME_CONTRACT.configuration,
    ...M4_RUNTIME_CONTRACT.migrations,
  }).length;
  return { root, event, runtime, records, source, native, copiedInputCount };
}
