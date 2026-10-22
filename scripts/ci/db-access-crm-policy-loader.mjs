import { fileURLToPath } from 'node:url';
import { exact } from './db-access-provider-runtime-identity.mjs';
import { failCrm } from './db-access-crm-proof-shape.mjs';

const INDEX = 'scripts/ci/db-access-crm-proof-policy.json';
const ARRAYS = new Set(['operations', 'diagnostics', 'cases']);
const OBJECTS = new Set(['sources', 'edges']);

// Every data file belongs to the immutable producer, never to the candidate checkout.
export function loadCrmProofPolicy(policy, producerRoot) {
  if (!policy.producerFiles?.[INDEX]) return undefined;
  const root = producerRoot ?? fileURLToPath(new URL('../../', import.meta.url));
  const read = file => JSON.parse(exact(root, file, policy.producerFiles[file]));
  const index = read(INDEX);
  if (!Array.isArray(index.shards) || !index.shards.length || index.shards.length > 128)
    failCrm('policy shard inventory');
  const seen = new Set();
  const parts = { sources: {}, edges: {}, operations: [], diagnostics: [], cases: [] };
  for (const file of index.shards) {
    if (!/^scripts\/ci\/db-access-crm-proof-data-[0-9]{3}\.json$/u.test(file) || seen.has(file))
      failCrm('policy shard path');
    seen.add(file);
    const shard = read(file);
    if (Object.keys(shard).sort().join(',') !== 'kind,value') failCrm('policy shard shape');
    if (ARRAYS.has(shard.kind)) {
      if (!Array.isArray(shard.value)) failCrm('policy array shard');
      parts[shard.kind].push(...shard.value);
    } else if (OBJECTS.has(shard.kind)) {
      if (!shard.value || Array.isArray(shard.value) || typeof shard.value !== 'object')
        failCrm('policy object shard');
      for (const [key, value] of Object.entries(shard.value)) {
        if (Object.hasOwn(parts[shard.kind], key)) failCrm('duplicate policy source/edge');
        parts[shard.kind][key] = value;
      }
    } else failCrm('policy shard kind');
  }
  if (!index.contract || typeof index.contract !== 'object') failCrm('policy metadata');
  const contract = { ...index.contract };
  if (['sources', 'edges', 'cases'].some(key => Object.hasOwn(contract, key)))
    failCrm('duplicate policy part');
  if (contract.witnesses?.operations || contract.witnesses?.diagnostics)
    failCrm('duplicate policy witnesses');
  return {
    ...contract,
    sources: parts.sources,
    edges: parts.edges,
    cases: parts.cases,
    witnesses: {
      ...contract.witnesses,
      operations: parts.operations,
      diagnostics: parts.diagnostics,
    },
  };
}
