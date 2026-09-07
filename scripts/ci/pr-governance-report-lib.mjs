import { collectSnapshot } from './pr-delivery-gate.mjs';
import {
  validateDeliveryContract,
  verifyCommitGraph,
  verifyFeedback,
  evaluateDeliveryChecks,
} from '../github-pr-governance-report.mjs';

function gateFail(message) {
  throw new Error(message);
}

export function governanceReport(contract, snapshot) {
  validateDeliveryContract(contract);
  const failures = [];
  const rows = new Map();
  for (const check of [
    () => verifyCommitGraph(snapshot),
    () => verifyFeedback(contract, snapshot.feedback, snapshot.expected.head),
  ]) {
    try {
      check();
    } catch (error) {
      failures.push(error.message);
    }
  }
  const delivery = {
    ...contract.deliveryContext,
    requirement: 'required',
    skipWhen: null,
    annotationPolicy: 'block-warning-failure',
    finalConclusions: ['success'],
  };
  for (const spec of [...contract.deliveryPrerequisites, delivery]) {
    try {
      const selected = evaluateDeliveryChecks(
        { ...contract, deliveryPrerequisites: [spec] },
        snapshot
      );
      rows.set(
        spec.context,
        selected.length ? 'completed/' + selected[0].conclusion : 'optional/missing'
      );
    } catch (error) {
      rows.set(spec.context, 'FAIL: ' + error.message);
      failures.push(error.message);
    }
  }
  return { rows, failures };
}

export async function collectGovernanceReport(client, contract, number) {
  validateDeliveryContract(contract);
  if (client.repository !== contract.repository || !Number.isSafeInteger(number) || number <= 0)
    gateFail('governance input mismatch');
  const endpoint = `repos/${contract.repository}/pulls/${number}`;
  const pull = await client.request(endpoint);
  const expected = {
    base: pull.base.sha,
    head: pull.head.sha,
    testedMerge: pull.merge_commit_sha,
  };
  const snapshot = await collectSnapshot(client, contract, expected, number, [
    contract.deliveryContext,
  ]);
  const finalPull = await client.request(endpoint);
  snapshot.pull = {
    state: finalPull.state,
    baseSha: finalPull.base.sha,
    headSha: finalPull.head.sha,
  };
  return governanceReport(contract, snapshot);
}
