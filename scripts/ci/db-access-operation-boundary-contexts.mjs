// A binding check, not a proof issuer. The fixed producer must independently derive
// both inputs from its authenticated source/image census and actual constructions.
// Passing this function cannot admit a receipt or change the native residual.
const SHA256 = /^[a-f0-9]{64}$/u;
const FIELDS = Object.freeze([
  'identity',
  'contextId',
  'sourceSha256',
  'imageSha256',
  'entryId',
  'sourceNodeId',
  'kind',
]);
const KINDS = new Set(['trusted', 'proof', 'consumer']);
const CONSTRUCTIONS = Object.freeze({
  trusted: new Set(['T1', 'T2', 'S']),
  proof: new Set(['P1', 'P2', 'P3', 'S']),
  consumer: new Set(['C', 'S']),
});

function refuse(reason) {
  throw new Error('incomplete: operation boundary ' + reason);
}

function key(row) {
  return row.identity + ':' + row.contextId;
}

function validateContext(row, constructed) {
  if (!row || Object.getPrototypeOf(row) !== Object.prototype) refuse('context record');
  const fields = constructed ? [...FIELDS, 'construction', 'derivationSha256'] : FIELDS;
  const descriptors = Object.getOwnPropertyDescriptors(row);
  if (
    Reflect.ownKeys(descriptors).length !== fields.length ||
    fields.some(field => !descriptors[field] || !Object.hasOwn(descriptors[field], 'value'))
  ) {
    refuse('context must contain exactly the fixed data fields');
  }
  if (
    ['identity', 'contextId', 'sourceSha256', 'imageSha256'].some(
      field => typeof row[field] !== 'string' || !SHA256.test(row[field])
    ) ||
    ['entryId', 'sourceNodeId'].some(
      field => typeof row[field] !== 'string' || !row[field] || row[field].length > 4096
    ) ||
    !KINDS.has(row.kind)
  ) {
    refuse('context identity or placement');
  }
}

function contextIndex(rows, label) {
  if (!Array.isArray(rows) || rows.length === 0) refuse(label + ' contexts missing');
  const index = new Map();
  for (const row of rows) {
    validateContext(row, label === 'constructed');
    const id = key(row);
    if (index.has(id)) refuse(label + ' duplicate context');
    index.set(id, row);
  }
  return index;
}

/**
 * Reconcile every independently observed use of selected identities. No context
 * can be silently dropped because another copy of the source is credentialless.
 * Unknown/unresolved contexts must remain required and cannot be represented as
 * one of these fully identified records until their actual image is established.
 *
 * This deliberately takes no stage flag capable of enabling production C:
 * early M4 qualification has zero whole-production consumer admission.
 */
export function bindEarlyM4Contexts({ requiredContexts, constructedContexts }) {
  const required = contextIndex(requiredContexts, 'required');
  const constructed = contextIndex(constructedContexts, 'constructed');
  if (required.size !== constructed.size) refuse('missing or foreign context');
  const identities = new Map();
  for (const [id, expected] of required) {
    const actual = constructed.get(id);
    if (!actual || FIELDS.some(field => actual[field] !== expected[field])) {
      refuse('source/image/entry context mismatch');
    }
    if (actual.kind === 'consumer' || !CONSTRUCTIONS[actual.kind].has(actual.construction)) {
      refuse('construction unavailable for early M4 context');
    }
    if (typeof actual.derivationSha256 !== 'string' || !SHA256.test(actual.derivationSha256)) {
      refuse('missing concrete derivation binding');
    }
    const contexts = identities.get(actual.identity) ?? [];
    contexts.push(
      Object.freeze({
        contextId: actual.contextId,
        sourceSha256: actual.sourceSha256,
        imageSha256: actual.imageSha256,
        entryId: actual.entryId,
        sourceNodeId: actual.sourceNodeId,
        kind: actual.kind,
        construction: actual.construction,
        derivationSha256: actual.derivationSha256,
      })
    );
    identities.set(actual.identity, contexts);
  }
  return Object.freeze({
    runtimeAdmission: false,
    productionConsumerAdmission: false,
    // Return detached immutable bindings, never the caller's mutable records.
    bindings: Object.freeze(
      [...identities]
        .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
        .map(([identity, contexts]) =>
          Object.freeze({
            identity,
            contexts: Object.freeze(
              contexts.sort((a, b) =>
                a.contextId < b.contextId ? -1 : a.contextId > b.contextId ? 1 : 0
              )
            ),
          })
        )
    ),
  });
}
