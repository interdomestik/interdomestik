import { isUnsafe } from './db-access-inventory.mjs';
import { digest } from './db-access-trust.mjs';

const fail = reason => {
  throw Error('incomplete: M4 context transport ' + reason);
};
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const keys = (value, expected) =>
  value &&
  typeof value === 'object' &&
  !Array.isArray(value) &&
  Object.keys(value).sort().join('|') === expected.split(' ').sort().join('|');
const outcomes = new Set(['visited', 'recursion', 'graph-bound', 'provider-boundary']);
const frameKey = key =>
  key === null ||
  key === 'unknown-frame' ||
  key === 'unresolved-frame' ||
  /^[a-f0-9]{64}$/u.test(key);

// Validate the additive report against the authenticated parent's exact native rows.
// A valid report is still not proof of deployment/image/loader context completeness.
export function mergeM4ContextBatches(prepared, partitions, results) {
  const source = prepared.providerUnit?.m4Proof;
  if (!source) {
    if (results.some(result => result.m4Contexts)) fail('foreign contract');
    return undefined;
  }
  const files = new Set(source.files);
  const selected = prepared.inventory.entries.filter(row => files.has(row.file));
  const entries = new Map(selected.map(row => [row.identity, row]));
  const roots = [...prepared.inventory.changed];
  if (
    !same(partitions.flat(), roots) ||
    new Set(roots).size !== roots.length ||
    results.length !== partitions.length
  )
    fail('incomplete root partition');
  const observations = [],
    frames = {};
  const locators = new Map();
  const validLocator = value => {
    if (value === null) return true;
    if (!Array.isArray(value) || value.length !== 4) return false;
    const file = value[0],
      sf = prepared.model.parsed.get(file);
    if (!sf) return false;
    if (!locators.has(file)) {
      const positions = new Set();
      prepared.model.walk(sf, node =>
        positions.add(JSON.stringify([file, node.pos, node.end, node.kind]))
      );
      locators.set(file, positions);
    }
    return locators.get(file).has(JSON.stringify(value));
  };
  for (let i = 0; i < results.length; i++) {
    const batch = results[i].m4Contexts;
    if (
      !keys(
        batch,
        'version sourcePolicyDigest sourceBookends modelDigest roots selectedIdentities observations frames unresolved allExecutableContextsQualified runtimeAdmission'
      ) ||
      batch.version !== 1 ||
      batch.sourcePolicyDigest !== source.policyDigest ||
      !same(batch.sourceBookends, source.bookends) ||
      batch.modelDigest !== digest(JSON.stringify([...prepared.model.sources])) ||
      !same(batch.roots, partitions[i]) ||
      !same(
        batch.selectedIdentities,
        selected.map(row => row.identity)
      ) ||
      !same(batch.unresolved, results[i].incomplete) ||
      batch.allExecutableContextsQualified !== false ||
      batch.runtimeAdmission !== false ||
      !Array.isArray(batch.observations) ||
      !batch.frames ||
      Array.isArray(batch.frames)
    )
      fail('batch source/root/identity/diagnostic binding');
    for (const [key, bindings] of Object.entries(batch.frames)) {
      if (
        !Array.isArray(bindings) ||
        digest(JSON.stringify(bindings)) !== key ||
        bindings.some(
          item =>
            !keys(item, 'parameter argument caller') ||
            !validLocator(item.parameter) ||
            !validLocator(item.argument) ||
            !frameKey(item.caller)
        )
      )
        fail('frame source locators');
      if (frames[key] && !same(frames[key], bindings)) fail('conflicting frame');
      frames[key] = bindings;
    }
    const boundFrame = value =>
      frameKey(value) &&
      (value === null || value.endsWith('-frame') || Object.hasOwn(batch.frames, value));
    for (const bindings of Object.values(batch.frames))
      if (bindings.some(item => !boundFrame(item.caller))) fail('missing caller frame');
    const allowed = new Set(partitions[i]);
    for (const row of batch.observations) {
      const entry = entries.get(row.identity);
      if (
        !keys(
          row,
          'identity origin owner invocation context definingContext outcome receiver unsafe incomplete indirect escaped open dispatchUnknown occurrences'
        ) ||
        !entry ||
        !allowed.has(row.origin) ||
        !same(row.owner, [entry.file, entry._owner.pos, entry._owner.end, entry._owner.kind]) ||
        !validLocator(row.invocation) ||
        !boundFrame(row.context) ||
        !boundFrame(row.definingContext) ||
        !outcomes.has(row.outcome) ||
        row.unsafe !== isUnsafe(entry) ||
        row.receiver !== entry.tenantPosture ||
        row.incomplete !== Boolean(entry._incomplete) ||
        row.indirect !== Boolean(entry._indirect) ||
        ['unsafe', 'escaped', 'open'].some(key => typeof row[key] !== 'boolean') ||
        !Array.isArray(row.dispatchUnknown) ||
        row.dispatchUnknown.some(reason => typeof reason !== 'string') ||
        !Number.isSafeInteger(row.occurrences) ||
        row.occurrences < 1
      )
        fail('observation identity/origin/frame');
      observations.push(row);
    }
  }
  return {
    version: 1,
    sourcePolicyDigest: source.policyDigest,
    sourceBookends: source.bookends,
    modelDigest: digest(JSON.stringify([...prepared.model.sources])),
    roots,
    selectedIdentities: selected.map(row => row.identity),
    observations,
    frames,
    allExecutableContextsQualified: false,
    runtimeAdmission: false,
  };
}
