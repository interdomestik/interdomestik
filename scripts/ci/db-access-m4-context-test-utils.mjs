import {
  createM4AttributionCollector,
  validateM4Attributions,
} from './db-access-m4-context-attribution.mjs';
import { createIncompleteCollector } from './db-access-incomplete.mjs';

// Data-contract fixtures only. These do NOT mint native/source/worker authority.
export const owner = ['packages/selected.ts', 0, 100, 262];
export const observation = (overrides = {}) => ({
  identity: 'a',
  origin: 'root-a.ts',
  owner,
  invocation: null,
  context: null,
  definingContext: null,
  outcome: 'visited',
  receiver: 'ambient',
  unsafe: true,
  incomplete: false,
  indirect: false,
  escaped: false,
  open: false,
  dispatchUnknown: [],
  occurrences: 1,
  ...overrides,
});
export const entry = (row, reason) => ({
  identity: row.identity,
  file: owner[0],
  tenantPosture: row.receiver,
  _owner: { pos: 0, end: 100, kind: 262 },
  _incomplete: row.incomplete,
  _indirect: row.indirect,
  reason,
});
export function collect(rows, kind, reason, occurrences = 1) {
  const collector = createM4AttributionCollector();
  for (let i = 0; i < occurrences; i++) collector.add(rows, kind, reason);
  return collector.entries();
}
export const incomplete = (...rows) => {
  const collector = createIncompleteCollector();
  collector.push(...rows);
  return collector.entries;
};
export const validate = (observations, attributions, diagnostics, failures = [], reasons = []) =>
  validateM4Attributions(
    { observations, attributions },
    new Map(observations.map((row, i) => [row.identity, entry(row, reasons[i])])),
    { incomplete: diagnostics, failures }
  );
