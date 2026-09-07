import {
  evaluateDeliveryChecks,
  readDeliveryContract,
  validateDeliveryContract,
  verifyCommitGraph,
  verifyFeedback,
} from './github-pr-governance-report.mjs';
import { canonicalJson, compareText, must, sha256 } from './slice-rehearse-canonical.mjs';

// A projection of the existing delivery contract, never another delivery policy.
export function deriveProofObligationGraph(input = readDeliveryContract()) {
  const contract = validateDeliveryContract(input);
  const nodes = contract.deliveryPrerequisites.map(spec => ({
    id: spec.context,
    appId: spec.appId,
    optional: spec.requirement === 'optional',
    dependencies: [],
  }));
  const byId = new Map(nodes.map(node => [node.id, node]));
  for (const spec of [
    ...contract.finalizerLeafPrerequisites,
    ...contract.providerRequiredContexts,
  ]) {
    must(
      byId.get(spec.context)?.appId === spec.appId,
      'required proof edge is missing or has a different app'
    );
  }
  byId.get('pr-finalizer').dependencies = contract.finalizerLeafPrerequisites.map(
    spec => spec.context
  );
  must(byId.has('e2e'), 'PR E2E delivery edge is missing');
  byId.get('e2e').dependencies = ['pr-e2e'];
  nodes.push(
    { id: 'review-feedback', appId: null, optional: false, dependencies: [] },
    {
      id: 'final-head',
      appId: null,
      optional: false,
      dependencies: [
        'review-feedback',
        ...contract.deliveryPrerequisites
          .filter(spec => spec.classification === 'generator')
          .map(spec => spec.context),
      ],
    },
    { id: 'pr-e2e', appId: null, optional: false, dependencies: ['final-head'] },
    {
      id: contract.deliveryContext.context,
      appId: contract.deliveryContext.appId,
      optional: false,
      dependencies: [...contract.deliveryPrerequisites.map(spec => spec.context), 'final-head'],
    },
    {
      id: 'protected-main-health',
      appId: null,
      optional: false,
      dependencies: [contract.deliveryContext.context],
    }
  );
  for (const node of nodes) node.dependencies.sort(compareText);
  nodes.sort((a, b) => compareText(a.id, b.id));
  invalidatedProofNodes(nodes, []);
  return nodes;
}

export function invalidatedProofNodes(nodes, changed) {
  must(Array.isArray(nodes) && nodes.length > 0 && nodes.length <= 128, 'proof graph is invalid');
  must(Array.isArray(changed) && changed.length <= 128, 'proof changes are invalid');
  const byId = new Map(nodes.map(node => [node.id, node]));
  must(byId.size === nodes.length, 'duplicate proof node');
  const visited = new Set(),
    visiting = new Set();
  function visit(id) {
    const node = byId.get(id);
    must(
      node && typeof id === 'string' && Array.isArray(node.dependencies),
      'unknown proof dependency'
    );
    must(!visiting.has(id), 'cyclic proof graph');
    if (visited.has(id)) return;
    visiting.add(id);
    for (const parent of node.dependencies) visit(parent);
    visiting.delete(id);
    visited.add(id);
  }
  for (const id of byId.keys()) visit(id);
  // Unknown impact invalidates the entire graph; it never means no impact.
  if (changed.some(id => !byId.has(id))) return [...byId.keys()].sort(compareText);
  const invalid = new Set(changed);
  for (const id of visited) {
    if (byId.get(id).dependencies.some(parent => invalid.has(parent))) invalid.add(id);
  }
  return [...invalid].sort(compareText);
}

export function evaluateFinalHeadReadiness(contractInput, snapshot) {
  const contract = validateDeliveryContract(contractInput);
  const graph = deriveProofObligationGraph(contract);
  const treeSha = verifyCommitGraph(snapshot);
  for (const key of [
    'checks',
    'annotations',
    'reviews',
    'issueComments',
    'reviewComments',
    'threads',
  ]) {
    must(snapshot.feedback?.pagination?.[key] === true, 'final-head feedback inventory incomplete');
  }
  // Finding-producing checks precede final-heavy execution; finalizer/delivery
  // continue to use their complete existing evaluator after that execution.
  const selected = evaluateDeliveryChecks(
    {
      ...contract,
      deliveryPrerequisites: contract.deliveryPrerequisites.filter(
        spec => spec.classification === 'generator'
      ),
    },
    snapshot
  );
  verifyFeedback(contract, snapshot.feedback, snapshot.expected.head);
  return {
    baseSha: snapshot.expected.base,
    headSha: snapshot.expected.head,
    treeSha,
    contractSha256: sha256(canonicalJson(contract)),
    graphSha256: sha256(canonicalJson(graph)),
    reviewSha256: sha256(canonicalJson({ selected, feedback: snapshot.feedback })),
  };
}

// Historical receipt bytes stay unchanged. This is a current, separately
// collected eligibility comparison supplied by the trusted proof host.
export function currentProofInputsMatch(previous, current, now = Date.now()) {
  const keys = [
    'baseSha',
    'headSha',
    'treeSha',
    'configSha256',
    'selectionSha256',
    'substrateSha256',
    'producerSha256',
    'verifierSha256',
    'requiredContextsAppsSha256',
    'reviewSha256',
    'externalSources',
  ];
  try {
    for (const value of [previous, current]) {
      must(
        value && Object.keys(value).sort(compareText).join() === [...keys].sort(compareText).join(),
        'proof input inventory differs'
      );
      for (const key of keys.filter(key => key !== 'externalSources')) {
        must(
          typeof value[key] === 'string' &&
            new RegExp(`^[a-f0-9]{${key.endsWith('Sha') ? 40 : 64}}$`, 'u').test(value[key]),
          'proof input identity invalid'
        );
      }
      must(
        Array.isArray(value.externalSources) && value.externalSources.length <= 32,
        'external proof sources invalid'
      );
      const ids = new Set();
      for (const source of value.externalSources) {
        must(
          source &&
            Object.keys(source).sort(compareText).join() === 'expiresAt,identitySha256,sourceId',
          'external proof source contract unavailable'
        );
        must(
          typeof source.sourceId === 'string' &&
            /^[a-z0-9._-]{1,64}$/u.test(source.sourceId) &&
            !ids.has(source.sourceId),
          'external proof source invalid'
        );
        ids.add(source.sourceId);
        must(
          /^[a-f0-9]{64}$/u.test(source.identitySha256) && Date.parse(source.expiresAt) > now,
          'external proof source expired or unknown'
        );
      }
    }
    return canonicalJson(previous) === canonicalJson(current);
  } catch {
    return false;
  }
}
