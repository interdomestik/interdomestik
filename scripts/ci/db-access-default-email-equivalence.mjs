import fs from 'node:fs';
import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

const digest = bytes => createHash('sha256').update(bytes).digest('hex');
const location = new URL('./db-access-default-email-equivalence-policy.json', import.meta.url);
const stat = fs.lstatSync(location);
const bytes = fs.readFileSync(location);
// Fixed reviewed source data beside the immutable evaluator; no caller, receipt or CLI selects it.
if (
  !stat.isFile() ||
  stat.isSymbolicLink() ||
  (stat.mode & 0o111) !== 0 ||
  digest(bytes) !== 'ed5656469e76a2ac243425c212e80e53bc9b4570a12c1faf1fc1e4a0e979e4be'
)
  throw new Error('incomplete: fixed default-email equivalence policy source mismatch');
const policy = JSON.parse(bytes);
const SCOPED = 'existing scoped executable controls changed; root epoch cannot certify equivalence';
const AMBIENT = 'changed executable edge reaches ambient operation';
const publicRow = row =>
  Object.fromEntries(Object.entries(row).filter(([key]) => !key.startsWith('_')));
const withoutReason = row => {
  const { reason, ...rest } = publicRow(row);
  return rest;
};
const sameSet = (actual, expected) =>
  actual.length === expected.length &&
  new Set(actual).size === actual.length &&
  actual.every(value => expected.includes(value));

function checkSources(prepared) {
  for (const expected of policy.files) {
    const current = prepared.sources.get(expected.file);
    const prior = prepared.trusted.get(expected.file);
    if (
      typeof current !== 'string' ||
      digest(current) !== expected.currentSha256 ||
      (prior === undefined ? null : digest(prior)) !== expected.adoptionSha256 ||
      prepared.providerFiles.has(expected.file) !== expected.providerBoundary
    )
      throw new Error('source binding changed: ' + expected.file);
  }
  // Detect resolution changes from newly added competing files even when importer bytes match.
  for (const [file, expected] of policy.dependencies) {
    if (!prepared.moduleTargets.dependencies.has(file))
      throw new Error('missing dependency observation: ' + file);
    const actual = [...(prepared.moduleTargets.dependencies.get(file) ?? [])];
    if (!sameSet(actual, expected)) throw new Error('dependency targets changed: ' + file);
  }
  for (const root of policy.roots) {
    const reached = new Set([root.file]),
      queue = [root.file],
      cut = [];
    for (const file of queue) {
      for (const target of prepared.moduleTargets.dependencies.get(file) ?? []) {
        if (!prepared.providerFiles.has(file) && prepared.providerFiles.has(target)) {
          cut.push(JSON.stringify([file, target]));
          continue;
        }
        if (!reached.has(target)) {
          reached.add(target);
          queue.push(target);
        }
      }
    }
    if (
      !sameSet(
        cut,
        root.providerBoundaryCutEdges.map(edge => JSON.stringify(edge))
      )
    )
      throw new Error('provider boundary changed: ' + root.file);
  }
}

// This finite precision preserves existing debt under one inapplicable email-leaf delta.
// It grants no tenant safety, runtime admission, new root, generic provider exemption or epoch.
// Inventory, changed roots, graph observations and every unresolved diagnostic remain intact.
export function classifyDefaultEmailEquivalence(prepared, graph, failures) {
  const result = { id: policy.id, operations: [], runtimeAdmission: false };
  if (
    prepared.adoption.commit !== policy.adoptionCommit ||
    prepared.adoption.tree !== policy.adoptionTree
  )
    return { ...result, status: 'not-applicable' };
  try {
    if (digest(prepared.baselineBytes) !== policy.baselineSha256)
      throw new Error('historical baseline changed');
    checkSources(prepared);
    const files = new Set(policy.operations.map(item => item.row.file));
    const selected = prepared.inventory.entries.filter(row => files.has(row.file));
    if (selected.length !== policy.operations.length)
      throw new Error('operation inventory changed');
    const byIdentity = new Map(selected.map(row => [row.identity, row]));
    if (byIdentity.size !== selected.length) throw new Error('duplicate operation identity');
    for (const item of policy.operations) {
      const row = byIdentity.get(item.row.identity);
      const failure = failures.get(item.row.identity);
      if (!row || !isDeepStrictEqual(publicRow(row), item.row))
        throw new Error('operation classification changed: ' + item.row.identity);
      if (
        !failure ||
        failure.reason !== SCOPED ||
        !isDeepStrictEqual(withoutReason(failure), withoutReason(item.row))
      )
        throw new Error('failure shape changed: ' + item.row.identity);
      for (const mounted of graph.failures.filter(entry => entry.identity === item.row.identity)) {
        const { mountedFrom, ...entry } = publicRow(mounted);
        if (
          !item.allowedMounts.includes(mountedFrom) ||
          !isDeepStrictEqual(withoutReason(entry), withoutReason(item.row)) ||
          entry.reason !== (item.row.reason ?? AMBIENT)
        )
          throw new Error('foreign or changed operation mount: ' + item.row.identity);
      }
    }
    // Validate the complete finite bundle before changing the verdict map.
    for (const item of policy.operations) failures.delete(item.row.identity);
    return {
      ...result,
      status: 'classified',
      kind: 'preserved-debt-source-equivalence',
      operations: policy.operations.map(({ row }) => ({ identity: row.identity, file: row.file })),
    };
  } catch (error) {
    return {
      ...result,
      status: 'held',
      reason: error instanceof Error ? error.message : String(error),
    };
  }
}
