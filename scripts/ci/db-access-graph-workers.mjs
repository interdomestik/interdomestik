import fs from 'node:fs';
import path from 'node:path';
import { Worker } from 'node:worker_threads';
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
  return hash(
    JSON.stringify({
      sources: [...current],
      trusted: [...prepared.trusted],
      adoption: prepared.adoption,
      policy: PROVIDER_UNIT_POLICY,
    })
  );
}
export function encodeInventory(prepared) {
  return {
    changed: [...prepared.inventory.changed],
    entries: prepared.inventory.entries.map(row => {
      const owner = row._owner;
      if (!owner) fail('missing owner');
      return {
        row: Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_'))),
        indirect: row._indirect,
        incomplete: row._incomplete,
        owner: [prepared.model.fileOf(owner), owner.pos, owner.end, owner.kind],
      };
    }),
  };
}
export function hydrateInventory(model, input) {
  const locators = new Map();
  for (const sf of model.parsed.values())
    model.walk(sf, node => {
      const key = JSON.stringify([model.fileOf(node), node.pos, node.end, node.kind]);
      locators.set(key, locators.has(key) ? null : node);
    });
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
    failures.push(...result.failures);
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
export async function runParallelGraph(prepared, input) {
  assertWorkerCode(prepared.repoRoot);
  const roots = [...prepared.inventory.changed];
  if (!roots.length) return mergeOwnedGraphs(prepared, [], []);
  // Fixed bounded pool; memory and actual parity must be approved before activation.
  const count = Math.min(2, roots.length),
    width = Math.ceil(roots.length / count),
    partitions = [];
  for (let i = 0; i < roots.length; i += width) partitions.push(roots.slice(i, i + width));
  const workers = [];
  try {
    const results = await Promise.all(
      partitions.map(
        origins =>
          new Promise((resolve, reject) => {
            const worker = new Worker(new URL('./db-access-graph-worker.mjs', import.meta.url), {
              env: {},
              execArgv: [],
              workerData: {
                ...input,
                repoRoot: prepared.repoRoot,
                origins,
                initialUnknown: [...prepared.provenance.analysisUnknown],
              },
            });
            workers.push(worker);
            let result,
              received = false;
            worker.on('message', message => {
              if (received || message?.snapshot !== input.snapshot) {
                reject(new Error('incomplete: duplicate or mismatched graph worker response'));
                return;
              }
              received = true;
              result = message;
            });
            worker.once('error', reject);
            worker.once('exit', code =>
              code === 0 && received
                ? resolve(result)
                : reject(new Error('incomplete: graph worker exit or missing response'))
            );
          })
      )
    );
    assertWorkerCode(prepared.repoRoot);
    if (graphSnapshot(prepared) !== input.snapshot) fail('parent source drift');
    return mergeOwnedGraphs(prepared, partitions, results);
  } finally {
    await Promise.allSettled(workers.map(worker => worker.terminate()));
  }
}
