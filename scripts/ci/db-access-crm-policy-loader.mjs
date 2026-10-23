import { fileURLToPath } from 'node:url';
import { exact } from './db-access-provider-runtime-identity.mjs';
import { failCrm } from './db-access-crm-proof-shape.mjs';
import { createCrmMountWire } from './db-access-crm-mount-wire.mjs';
import { createCrmDiagnosticDecoder } from './db-access-crm-diagnostic-encoding.mjs';

const INDEX = 'scripts/ci/db-access-crm-proof-policy.json';
const ARRAYS = new Set(['operations', 'diagnostics', 'cases']);
const OBJECTS = new Set(['sources', 'edges']);
const ENCODED = 'diagnostics.';

// Every data file belongs to the immutable producer, never to the candidate checkout.
export function loadCrmProofPolicy(policy, producerRoot) {
  if (!policy.producerFiles?.[INDEX]) return undefined;
  const root = producerRoot ?? fileURLToPath(new URL('../../', import.meta.url));
  const read = file => {
    const descriptor = policy.producerFiles[file];
    if (
      !descriptor ||
      !Number.isSafeInteger(descriptor.bytes) ||
      descriptor.bytes < 1 ||
      descriptor.bytes > 128 * 1024
    )
      failCrm('policy file byte budget');
    return JSON.parse(exact(root, file, descriptor));
  };
  const index = read(INDEX);
  if (!index || Array.isArray(index) || typeof index !== 'object') failCrm('policy index');
  if (!Array.isArray(index.shards) || !index.shards.length || index.shards.length > 128)
    failCrm('policy shard inventory');
  const versioned = Object.hasOwn(index, 'wireVersion');
  if (
    versioned &&
    (index.wireVersion !== 1 ||
      Object.keys(index).sort().join(',') !== 'contract,mountEncoding,shards,wireVersion')
  )
    failCrm('policy wire version/fields');
  if (!versioned && Object.hasOwn(index, 'mountEncoding')) failCrm('policy wire version');
  const mount = versioned ? createCrmMountWire(index) : undefined;
  const seen = new Set();
  const parts = { sources: {}, edges: {}, operations: [], diagnostics: [], cases: [] };
  let legacyDiagnostics = false;
  let encoded;
  for (const [position, file] of index.shards.entries()) {
    if (!/^scripts\/ci\/db-access-crm-proof-data-[0-9]{3}\.json$/u.test(file) || seen.has(file))
      failCrm('policy shard path');
    seen.add(file);
    const shard = read(file);
    if (
      !shard ||
      Array.isArray(shard) ||
      typeof shard !== 'object' ||
      Object.keys(shard).sort().join(',') !== 'kind,value'
    )
      failCrm('policy shard shape');
    if (ARRAYS.has(shard.kind)) {
      if (!Array.isArray(shard.value)) failCrm('policy array shard');
      // Even an empty legacy diagnostics shard selects the legacy representation.
      if (shard.kind === 'diagnostics') legacyDiagnostics = true;
      parts[shard.kind].push(...shard.value);
    } else if (OBJECTS.has(shard.kind)) {
      if (!shard.value || Array.isArray(shard.value) || typeof shard.value !== 'object')
        failCrm('policy object shard');
      for (const [key, value] of Object.entries(shard.value)) {
        if (Object.hasOwn(parts[shard.kind], key)) failCrm('duplicate policy source/edge');
        parts[shard.kind][key] = value;
      }
    } else if (mount?.accept(shard, position)) {
      // Mount content is only reconstructed, never classified here.
    } else if (typeof shard.kind === 'string' && shard.kind.startsWith(ENCODED)) {
      if (!versioned) failCrm('policy wire version');
      encoded ??= createCrmDiagnosticDecoder();
      encoded.add(shard.kind, shard.value, position);
    } else failCrm('policy shard kind');
    if (legacyDiagnostics && encoded) failCrm('mixed diagnostic representation');
  }
  if (!index.contract || typeof index.contract !== 'object') failCrm('policy metadata');
  const contract = { ...index.contract };
  if (['sources', 'edges', 'cases'].some(key => Object.hasOwn(contract, key)))
    failCrm('duplicate policy part');
  if (contract.witnesses?.operations || contract.witnesses?.diagnostics)
    failCrm('duplicate policy witnesses');
  // Decoded rows are logically equal to legacy rows; encoded files are still a new producer
  // identity, so any native envelope must be regenerated, never reused.
  if (versioned && !encoded) failCrm('missing encoded diagnostics');
  const diagnostics = encoded ? encoded.finish() : parts.diagnostics;
  const mountEvidence = mount ? mount.finish() : contract.witnesses?.mountEvidence;
  return {
    ...contract,
    sources: parts.sources,
    edges: parts.edges,
    cases: parts.cases,
    witnesses: {
      ...contract.witnesses,
      ...(mount ? { mountEvidence } : {}),
      operations: parts.operations,
      diagnostics,
    },
  };
}
