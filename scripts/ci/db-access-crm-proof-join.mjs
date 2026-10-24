import {
  MESSAGE_PROOF_CONTRACT,
  messageCaseIdentities,
} from './db-access-message-proof-registry.mjs';
import { isFreshCrmRuntimeResult } from './db-access-crm-runtime.mjs';
import { hash } from './db-access-provider-runtime-identity.mjs';
import {
  crmDigest,
  failCrm,
  freezeCrm,
  validateCrmContract,
} from './db-access-crm-proof-shape.mjs';
import { validateCrmRuntimeResult } from './db-access-crm-runtime-result.mjs';

// This validator checks bindings only. It cannot admit a serialized or caller-made receipt.
export function validateCrmJoinBindings({ context, policy, runtime, provider, report }) {
  const contract = policy.crmProof;
  validateCrmContract(contract);
  const policySha256 = hash(JSON.stringify(policy));
  if (
    runtime.contextSha256 !== crmDigest(context) ||
    runtime.policySha256 !== policySha256 ||
    provider.policySha256 !== policySha256 ||
    crmDigest(provider.context) !== crmDigest(context)
  )
    failCrm('join event/head/policy binding');
  if (
    provider.runtimeExecuted !== true ||
    provider.passedTests !== policy.runtimeEnforcement.requiredTests ||
    provider.namedPassedTests !== 17 ||
    provider.staticResidualStillRequired !== true ||
    provider.wholeS8Acceptance !== false ||
    crmDigest(provider.before) !== crmDigest(provider.after)
  )
    failCrm('join original proof/bookends');
  if (!provider.before?.candidate || !provider.before?.producer)
    failCrm('join missing source bookends');
  if (
    report.status !== 'pass' ||
    report.baselineCount !== 604 ||
    report.failingNewCount !== 0 ||
    report.failingNewEntries?.length !== 0 ||
    report.unresolvedIncomplete?.length !== 0
  )
    failCrm('join static residual');
  // A HOLD message inventory discharges nothing and therefore can never join.
  const message = provider.messageRuntime;
  if (
    policy.messageProof?.witnessInventory?.state !== 'bound' ||
    message?.version !== MESSAGE_PROOF_CONTRACT.version ||
    message.contractId !== MESSAGE_PROOF_CONTRACT.id ||
    message.setupComplete !== true ||
    message.teardownComplete !== true ||
    message.passedTests !== MESSAGE_PROOF_CONTRACT.requiredTests ||
    !Array.isArray(message.identities) ||
    crmDigest(message.identities) !== crmDigest(messageCaseIdentities())
  )
    failCrm('join message proof');
  const unit = report.providerUnit;
  const obligations = unit?.crmProofObligations;
  if (
    unit?.policyDigest !== policySha256 ||
    unit.runtimeAdmission !== false ||
    obligations?.runtimeAdmission !== false ||
    obligations.contractDigest !== crmDigest(contract) ||
    obligations.inventoryDigest !== contract.inventory.newEntriesDigest ||
    obligations.mountDigest !== crmDigest(contract.witnesses.mountEvidence) ||
    obligations.diagnosticDigest !== crmDigest(contract.witnesses.diagnostics)
  )
    failCrm('join static contract binding');
  const operations = rows =>
    rows.map(row => ({
      identity: row.identity,
      caseIds: row.caseIds,
      productionOperation: row.productionOperation,
    }));
  const diagnostics = rows =>
    rows.map(row => ({
      file: row.file,
      reason: row.reason,
      occurrences: row.occurrences,
      caseIds: row.caseIds,
    }));
  if (
    crmDigest(operations(obligations.operations)) !==
      crmDigest(operations(contract.witnesses.operations)) ||
    crmDigest(diagnostics(obligations.diagnostics)) !==
      crmDigest(diagnostics(contract.witnesses.diagnostics)) ||
    crmDigest(obligations.requiredCases) !== crmDigest(contract.runtime.requiredCases)
  )
    failCrm('join operation/diagnostic witnesses');
  const completion = validateCrmRuntimeResult({ ...runtime, version: 1 }, contract);
  if (
    runtime.contractSha256 !== completion.contractSha256 ||
    runtime.coverageSha256 !== completion.coverageSha256 ||
    crmDigest(runtime.coverage) !== crmDigest(completion.coverage)
  )
    failCrm('join runtime coverage');
  return {
    contractId: contract.id,
    contractSha256: completion.contractSha256,
    contextSha256: crmDigest(context),
    policySha256,
    inventoryDigest: obligations.inventoryDigest,
    diagnosticDigest: obligations.diagnosticDigest,
    runtimeCoverageSha256: completion.coverageSha256,
    runtimeAdmission: false,
  };
}

export function joinFreshCrmProof(input) {
  if (!isFreshCrmRuntimeResult(input.runtime)) failCrm('join requires direct runtime execution');
  const binding = validateCrmJoinBindings(input);
  return freezeCrm({ ...binding, runtimeAdmission: true, wholeS8Acceptance: false });
}
