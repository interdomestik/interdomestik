import fs from 'node:fs';
import path from 'node:path';
import {
  runOwnedGraphWorkerPool,
  claimOwnedM4WorkerEvidence,
} from './db-access-graph-worker-pool.mjs';
import { bindM4WorkerRequest } from './db-access-m4-native-prerequisite.mjs';
export { encodeInventory } from './db-access-inventory-wire.mjs';
import { createHash } from 'node:crypto';
import { PROVIDER_UNIT_POLICY } from './db-access-provider-unit-policy.mjs';
import { candidateSources } from './db-access-trust.mjs';
import { createIncompleteCollector } from './db-access-incomplete.mjs';
const fail = reason => {
  throw new Error('incomplete: graph worker ' + reason);
};
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const codeFiles = [
  'db-access-graph-workers.mjs',
  'db-access-graph-worker.mjs',
  'db-access-evaluator.mjs',
  'db-access-graph.mjs',
  'db-access-prepare.mjs',
  'db-access-cli.mjs',
  'db-access-graph-roots.mjs',
  'db-access-graph-core.mjs',
  'db-access-graph-worker-pool.mjs',
  'db-access-graph-session-driver.mjs',
];
export function assertWorkerCode(repoRoot) {
  for (const name of codeFiles) {
    const file = 'scripts/ci/' + name,
      expected = PROVIDER_UNIT_POLICY.producerFiles[file];
    if (!expected) fail('missing authenticated producer descriptor ' + file);
    const absolute = path.join(repoRoot, file),
      bytes = fs.readFileSync(absolute);
    if (
      fs.realpathSync(absolute) !== absolute ||
      bytes.length !== expected.bytes ||
      hash(bytes) !== expected.sha256
    )
      fail('producer code drift ' + file);
  }
}
export function graphSnapshot(prepared) {
  const current = candidateSources(prepared.repoRoot);
  for (const [file, content] of prepared.resolutionSources)
    if (file.endsWith('/package.json')) current.set(file, content);
  if (hash(JSON.stringify([...current])) !== hash(JSON.stringify([...prepared.sources])))
    fail('prepared model source drift');
  return hash(
    JSON.stringify({
      sources: [...current],
      trusted: [...prepared.trusted],
      adoption: prepared.adoption,
      policy: PROVIDER_UNIT_POLICY,
    })
  );
}
export function hydrateInventory(model, input) {
  const locators = new Map(),
    requested = new Set(),
    positions = new Map();
  for (const item of input.entries) {
    requested.add(JSON.stringify(item.owner));
    const [file, pos] = item.owner;
    const selected = positions.get(file) ?? new Set();
    selected.add(pos);
    positions.set(file, selected);
  }
  for (const sf of model.parsed.values()) {
    const selected = positions.get(model.fileOf(sf));
    if (!selected) continue;
    model.walk(sf, node => {
      if (!selected.has(node.pos)) return;
      const key = JSON.stringify([model.fileOf(node), node.pos, node.end, node.kind]);
      if (requested.has(key)) locators.set(key, locators.has(key) ? null : node);
    });
  }
  if (!Array.isArray(input.changed) || new Set(input.changed).size !== input.changed.length)
    fail('changed set');
  return {
    changed: new Set(input.changed),
    entries: input.entries.map(item => {
      const owner = locators.get(JSON.stringify(item.owner));
      if (!owner) fail('missing or ambiguous owner');
      return {
        ...item.row,
        _owner: owner,
        _indirect: item.indirect,
        _incomplete: item.incomplete,
      };
    }),
  };
}
export function mergeOwnedGraphs(prepared, partitions, results) {
  const roots = [...prepared.inventory.changed],
    covered = partitions.flat();
  if (
    JSON.stringify(covered) !== JSON.stringify(roots) ||
    new Set(covered).size !== roots.length ||
    results.length !== partitions.length
  )
    fail('incomplete root partition');
  const incomplete = createIncompleteCollector(),
    failures = [],
    reachedTestSources = new Set(),
    late = new Set();
  for (const file of prepared.provenance.environmentChanges)
    incomplete.push({
      file,
      reason: 'unsupported mutable global environment root',
    });
  const initial = new Set(prepared.provenance.analysisUnknown);
  for (const reason of initial) incomplete.push({ file: '<analysis>', reason });
  for (let i = 0; i < results.length; i++) {
    const result = results[i];
    if (JSON.stringify(result.origins) !== JSON.stringify(partitions[i]))
      fail('origin response mismatch');
    const allowed = new Set(partitions[i]);
    if (result.failures.some(row => !allowed.has(row.mountedFrom))) fail('foreign failure origin');
    const count = result.incomplete.reduce((sum, row) => sum + row.occurrences, 0);
    if (count !== result.incompleteRawCount) fail('diagnostic count mismatch');
    for (const failure of result.failures) failures.push(failure);
    for (const row of result.incomplete) {
      if (!Number.isSafeInteger(row.occurrences) || row.occurrences < 1)
        fail('invalid multiplicity');
      if (row.file === '<analysis>') {
        if (row.reason !== 'provenance-work-bound' || row.occurrences !== 1)
          fail('unexpected late reason');
        if (!initial.has(row.reason)) late.add(row.reason);
      } else {
        if (!allowed.has(row.file)) fail('foreign diagnostic origin');
        incomplete.push(row);
      }
    }
    for (const file of result.reachedTestSources) reachedTestSources.add(file);
  }
  for (const reason of late) incomplete.push({ file: '<analysis>', reason });
  return {
    failures,
    incomplete: incomplete.entries,
    incompleteRawCount: incomplete.rawCount,
    reachedTestSources,
  };
}
export async function runParallelGraph(prepared, input, pool) {
  assertWorkerCode(prepared.repoRoot);
  const roots = [...prepared.inventory.changed];
  if (!roots.length) return mergeOwnedGraphs(prepared, [], []);
  const partitions = [];
  for (let i = 0; i < roots.length; i += 64) partitions.push(roots.slice(i, i + 64));
  const m4Request = prepared.m4NativeInventory
    ? bindM4WorkerRequest(prepared.m4NativeInventory, input)
    : undefined;
  const results = await runOwnedGraphWorkerPool(
    pool,
    partitions,
    {
      ...input,
      initialUnknown: [...prepared.provenance.analysisUnknown],
    },
    m4Request
  );
  assertWorkerCode(prepared.repoRoot);
  if (graphSnapshot(prepared) !== input.snapshot) fail('parent source drift');
  const merged = mergeOwnedGraphs(prepared, partitions, results);
  if (m4Request) merged.m4WorkerTransport = claimOwnedM4WorkerEvidence(results);
  return merged;
}
