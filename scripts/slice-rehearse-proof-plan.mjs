import { compareText, must } from './slice-rehearse-canonical.mjs';

const KEY = /^[0-9a-f]{64}$/u;

export function planInvalidatedProofs({ requiredLanes, decisions }) {
  must(Array.isArray(requiredLanes) && requiredLanes.length > 0, 'required lanes are unavailable');
  must(Array.isArray(decisions), 'proof decisions are unavailable');
  const required = [...requiredLanes].sort(compareText);
  must(new Set(required).size === required.length, 'required lanes must be unique');
  const byLane = new Map();
  for (const decision of decisions) {
    must(typeof decision?.lane === 'string', 'lane decision is invalid');
    must(!byLane.has(decision.lane), 'lane decision must be unique');
    must(typeof decision.reusable === 'boolean', 'lane decision is invalid');
    if (decision.evidenceKey !== null)
      must(KEY.test(decision.evidenceKey), 'evidence key is invalid');
    byLane.set(decision.lane, decision);
  }
  const reuse = required.filter(lane => byLane.get(lane)?.reusable === true);
  return { reuse, run: required.filter(lane => !reuse.includes(lane)) };
}

export function assertHeavyProofExecution({ evidenceKey, ledger }) {
  must(KEY.test(evidenceKey ?? ''), 'heavy proof evidence key is invalid');
  must(ledger instanceof Set, 'heavy proof ledger is unavailable');
  must(!ledger.has(evidenceKey), 'duplicate heavy proof is forbidden');
  ledger.add(evidenceKey);
  return true;
}
