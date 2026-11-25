import { retainedConsumerProblem } from './rules-schema-consumers.mjs';
import { comparePublicExports } from './rules-schema-public.mjs';
import { proveBuilderModule } from './schema-builder-forms.mjs';
import { legacyTableIdentities } from './schema-builder-imports.mjs';

export function tableAdmissionProblem(
  before,
  after,
  anchor,
  added,
  accumulated,
  { beforeInventory, afterInventory, transition }
) {
  const legacy = legacyTableIdentities(before, before.reachable);
  if (legacy.reason) return legacy.reason;
  const tableNames = new Set();
  const types = new Map();
  const tableBindings = new Set(legacy.tables.keys());
  const identities = new Set([...legacy.tables.values()].map(table => table.name));
  const checks = transition?.checks;
  // The exact checks image has a reviewed partial index outside the additive grammar. During
  // accumulated replay its identities are needed before proving the verification module.
  const ordered = added.includes(checks)
    ? [checks, ...added.filter(file => file !== checks)]
    : added;
  for (const file of ordered) {
    const proof = proveAddedModule(after, anchor, file, checks, legacy);
    if (proof.reason) return `${proof.reason} ${file}`;
    types.set(file, proof.types);
    for (const [key, table] of proof.tables) {
      if (identities.has(table.name)) return `duplicate database identity public.${table.name}`;
      identities.add(table.name);
      tableBindings.add(key);
      tableNames.add(key.split('#')[1]);
      if (accumulated) legacy.tables.set(key, table);
    }
  }
  const exports = comparePublicExports(before, after, beforeInventory, afterInventory, {
    types,
    tableBindings,
    anchorModules: anchor.reachable,
  });
  if (exports.reason) return exports.reason;
  if (added.length === 0) return null;
  return retainedConsumerProblem(before, after, anchor, exports.affected, tableNames);
}

function proveAddedModule(after, anchor, file, checks, legacy) {
  return file === checks
    ? { ...legacyTableIdentities(after, [file]), types: new Set() }
    : proveBuilderModule(after, anchor, file, legacy.tables);
}
