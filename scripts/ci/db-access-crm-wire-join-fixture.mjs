import { crmDigest } from './db-access-crm-proof-shape.mjs';
import { hash } from './db-access-provider-runtime-identity.mjs';
import { validateCrmRuntimeResult } from './db-access-crm-runtime-result.mjs';
import {
  MESSAGE_PROOF_CONTRACT,
  messageCaseIdentities,
} from './db-access-message-proof-registry.mjs';

// Synthetic serialized bindings only: joinFreshCrmProof must reject these unbranded results.
export function serializedJoinFixture(contract, producerFiles) {
  const policy = {
    crmProof: contract,
    producerFiles,
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
