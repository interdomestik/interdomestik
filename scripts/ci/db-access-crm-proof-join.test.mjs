import assert from 'node:assert/strict';
import test from 'node:test';
import { validateCrmJoinBindings, joinFreshCrmProof } from './db-access-crm-proof-join.mjs';
import { crmDigest } from './db-access-crm-proof-shape.mjs';
import { hash } from './db-access-provider-runtime-identity.mjs';
import { validateCrmRuntimeResult } from './db-access-crm-runtime-result.mjs';
import {
  MESSAGE_PROOF_CONTRACT,
  messageCaseIdentities,
} from './db-access-message-proof-registry.mjs';

function fixture() {
  const contract = {
    id: 's8-crm-integration-proof-v1',
    version: 1,
    baselineCount: 604,
    runtimeRequired: true,
    acceptedReceiptInputs: false,
    runtimeAdmission: false,
    sources: { 'fixture.ts': {} },
    inventory: { newEntriesDigest: 'inventory' },
    witnesses: {
      mountEvidence: { roots: [] },
      operations: [
        {
          identity: 'operation',
          file: 'fixture.ts',
          productionOperation: true,
          caseIds: ['crm-fixture'],
        },
      ],
      diagnostics: [
        { file: 'fixture.ts', reason: 'fixed', occurrences: 1, caseIds: ['crm-fixture'] },
      ],
    },
    cases: [
      {
        id: 'crm-fixture',
        kind: 'runtime',
        files: ['fixture.ts'],
        justification: 'Actual fixed case',
        requiredAssertions: ['own-row', 'foreign-denied'],
      },
    ],
    runtime: { requiredCases: ['crm-fixture'] },
  };
  const policy = {
    crmProof: contract,
    runtimeEnforcement: { requiredTests: 9 },
    messageProof: { witnessInventory: { state: 'bound' } },
  };
  const context = {
    repository: 'interdomestik/interdomestik',
    eventName: 'pull_request',
    headCommit: 'a'.repeat(40),
    candidateCommit: 'b'.repeat(40),
    candidateTree: 'c'.repeat(40),
  };
  const policySha256 = hash(JSON.stringify(policy));
  const runtime = {
    ...validateCrmRuntimeResult(
      {
        version: 1,
        setupComplete: true,
        teardownComplete: true,
        runtimeAdmission: false,
        postgres: 160005,
        cases: [{ id: 'crm-fixture', status: 'passed', assertions: ['own-row', 'foreign-denied'] }],
      },
      contract
    ),
    contextSha256: crmDigest(context),
    policySha256,
  };
  const provider = {
    context,
    policySha256,
    runtimeExecuted: true,
    passedTests: 9,
    namedPassedTests: 17,
    staticResidualStillRequired: true,
    wholeS8Acceptance: false,
    before: { candidate: 'source', producer: 'producer' },
    after: { candidate: 'source', producer: 'producer' },
    messageRuntime: {
      version: MESSAGE_PROOF_CONTRACT.version,
      contractId: MESSAGE_PROOF_CONTRACT.id,
      setupComplete: true,
      teardownComplete: true,
      passedTests: MESSAGE_PROOF_CONTRACT.requiredTests,
      identities: messageCaseIdentities(),
    },
  };
  const report = {
    status: 'pass',
    baselineCount: 604,
    failingNewCount: 0,
    failingNewEntries: [],
    unresolvedIncomplete: [],
    providerUnit: {
      policyDigest: policySha256,
      runtimeAdmission: false,
      crmProofObligations: {
        runtimeAdmission: false,
        contractDigest: crmDigest(contract),
        inventoryDigest: contract.inventory.newEntriesDigest,
        mountDigest: crmDigest(contract.witnesses.mountEvidence),
        diagnosticDigest: crmDigest(contract.witnesses.diagnostics),
        operations: structuredClone(contract.witnesses.operations),
        diagnostics: structuredClone(contract.witnesses.diagnostics),
        requiredCases: [...contract.runtime.requiredCases],
      },
    },
  };
  return { context, policy, runtime, provider, report };
}

test('matching serialized bindings validate but never grant admission', () => {
  const input = fixture();
  assert.equal(validateCrmJoinBindings(input).runtimeAdmission, false);
  assert.throws(() => joinFreshCrmProof(input), /direct runtime execution/);
});

for (const [name, mutate] of [
  ['foreign event', x => (x.context.eventName = 'push')],
  ['foreign repository', x => (x.context.repository = 'other/repo')],
  ['different head', x => (x.context.headCommit = 'd'.repeat(40))],
  ['stale merge', x => (x.context.candidateCommit = 'd'.repeat(40))],
  ['wrong tree', x => (x.context.candidateTree = 'd'.repeat(40))],
  ['altered policy', x => (x.policy.crmProof.sources.extra = {})],
  ['changed producer', x => (x.provider.after.producer = 'changed')],
  ['changed candidate', x => (x.provider.after.candidate = 'changed')],
  ['missing bookend', x => delete x.provider.before.candidate],
  ['missing original runtime', x => (x.provider.runtimeExecuted = false)],
  ['missing named proof', x => (x.provider.namedPassedTests = 16)],
  ['missing message proof', x => delete x.provider.messageRuntime],
  ['old message version', x => (x.provider.messageRuntime.version = 1)],
  ['foreign message contract', x => (x.provider.messageRuntime.contractId = 'foreign')],
  ['old message count', x => (x.provider.messageRuntime.passedTests = 9)],
  ['foreign message source', x => (x.provider.messageRuntime.identities[0].file = 'foreign.ts')],
  ['message test omitted', x => x.provider.messageRuntime.identities.pop()],
  ['message teardown missing', x => (x.provider.messageRuntime.teardownComplete = false)],
  ['static failure', x => (x.report.status = 'incomplete')],
  ['extra operation', x => x.report.failingNewEntries.push({ identity: 'new' })],
  ['unknown diagnostic', x => x.report.unresolvedIncomplete.push({ reason: 'new' })],
  ['baseline mutation', x => (x.report.baselineCount = 605)],
  ['missing operation', x => x.report.providerUnit.crmProofObligations.operations.pop()],
  [
    'changed diagnostic occurrences',
    x => x.report.providerUnit.crmProofObligations.diagnostics[0].occurrences++,
  ],
  ['changed mount', x => (x.report.providerUnit.crmProofObligations.mountDigest = 'changed')],
  ['missing runtime case', x => x.runtime.cases.pop()],
  ['skipped runtime case', x => (x.runtime.cases[0].status = 'skipped')],
  ['failed runtime case', x => (x.runtime.cases[0].status = 'failed')],
  ['missing assertion', x => x.runtime.cases[0].assertions.pop()],
  ['forged coverage', x => (x.runtime.coverage[0].identity = 'foreign')],
  ['premature admission', x => (x.runtime.runtimeAdmission = true)],
])
  test(name + ' refuses the join', () => {
    const input = fixture();
    mutate(input);
    assert.throws(() => validateCrmJoinBindings(input), /crm proof/);
  });
