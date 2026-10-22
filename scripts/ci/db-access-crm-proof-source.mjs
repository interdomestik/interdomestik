import { namedProofEdges } from './db-access-named-proof-source.mjs';
import { classifyCrmWitnesses } from './db-access-crm-proof-witnesses.mjs';
import {
  crmDigest,
  failCrm,
  freezeCrm,
  validateCrmContract,
} from './db-access-crm-proof-shape.mjs';

const authenticated = new WeakSet();
// Policy comes only from the authenticated immutable producer, never a candidate report.
export function verifyCrmProofSource(root, model, policy, readExact) {
  const contract = policy.crmProof;
  if (!contract) return undefined;
  validateCrmContract(contract);
  for (const [file, expected] of Object.entries(contract.sources)) {
    const content = readExact(root, file, expected);
    if (model.parsed.has(file) && model.parsed.get(file).text !== content)
      failCrm('model/source mismatch ' + file);
  }
  for (const [file, expectedEdges] of Object.entries(contract.edges)) {
    if (!Object.hasOwn(contract.sources, file) || !model.parsed.has(file))
      failCrm('unbound executable source ' + file);
    const edges = namedProofEdges(model, file);
    if (crmDigest(edges) !== crmDigest(expectedEdges)) failCrm('dependency drift ' + file);
    for (const target of Object.values(edges))
      if (target && !Object.hasOwn(contract.sources, target))
        failCrm('dependency leaves closure ' + file);
  }
  for (const rootRecord of contract.witnesses.mountEvidence.roots)
    if (!Object.hasOwn(contract.sources, rootRecord.file))
      failCrm('unbound root ' + rootRecord.file);
  const result = freezeCrm(structuredClone(contract));
  authenticated.add(result);
  return result;
}
export function crmProofObligations(contract, context) {
  if (!contract)
    return {
      operations: [],
      diagnostics: [],
      remaining: context.incomplete,
      runtimeAdmission: false,
    };
  if (!authenticated.has(contract)) failCrm('unauthenticated obligations');
  return classifyCrmWitnesses(contract, context);
}
