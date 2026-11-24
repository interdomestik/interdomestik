// The consent registry of CHK-22 (WP-05 design §2.1): schema, the trusted-base comparison and the
// per-kind test evidence. The lint rule reads the same parsed registry through `registryFor`.
import { multisetMinus } from '../server-mutation/baseline.mjs';

export { REGISTRY_PATH, parseRegistry, registryFor } from './registry-parse.mjs';
export { readLanes } from './registry-lanes.mjs';
export { testEvidence } from './registry-evidence.mjs';

const BOUND_FIELDS = [
  'kind',
  'file',
  'control',
  'exportName',
  'storedIn',
  'payloadField',
  'selectedRecord',
];
const USE_FIELDS = ['file', 'submission', 'test'];
const exceptionKey = e => `${e.check}\u0000${e.item}\u0000${e.kind}`;

// Tamper findings of the registry against the trusted base (§2.1 "Judged against the trusted
// base"); each needs the owner's fresh `#registry:<id>` exception of CHK-22.
export function registryTamper(baseRegistry, headRegistry, base, head, isRendered) {
  if (!baseRegistry) {
    return [...headRegistry.values()]
      .filter(entry => entry.kind === 'not-consent')
      .filter(entry => !freshFor(base, head, entry.id))
      .map(entry => `CHK-22#registry-not-consent:${entry.id}`);
  }
  const out = [];
  for (const [id, before] of baseRegistry)
    out.push(...entryTamper(id, before, headRegistry.get(id), isRendered));
  for (const [id, entry] of headRegistry)
    if (!baseRegistry.has(id) && entry.kind === 'not-consent')
      out.push(`CHK-22#registry-not-consent:${id}`);
  // One fresh exception per entry admits every change of that entry.
  return out.filter(finding => !freshFor(base, head, idOfFinding(finding)));
}

// The registry freeze of the WP-05 flip (D-7; r3-B1): while CHK-22 enforces, the head registry
// must be empty until a reviewed scanner lifts the freeze. Each entry is a `registry-frozen`
// finding, which no exception admits (the owner's approval of a registration is not
// machine-enforced yet: O5). No reference is consulted, so nothing a base holds, whatever its mode
// history, can be inherited.
export const frozenEntries = headRegistry =>
  [...headRegistry.keys()].map(id => `CHK-22#registry-frozen:${id}`);

// The changes of one base entry in the head: removed, a bound field changed, a use or alias removed.
function entryTamper(id, before, after, isRendered) {
  if (!after) return isRendered(before) ? [`CHK-22#registry-removed:${id}`] : [];
  const out = [];
  for (const field of BOUND_FIELDS)
    if (before[field] !== after[field]) out.push(`CHK-22#registry-changed-${field}:${id}`);
  const uses = new Map(after.uses.map(use => [use.useId, use]));
  for (const use of before.uses) {
    const now = uses.get(use.useId);
    if (!now) out.push(`CHK-22#registry-removed-use:${id}:${use.useId}`);
    // A use is its file, submission and test; keeping only its useId is a change (r1 H3).
    else if (USE_FIELDS.some(field => now[field] !== use[field]))
      out.push(`CHK-22#registry-changed-use:${id}:${use.useId}`);
  }
  const aliasKeys = new Set(after.aliases.map(a => `${a.file}#${a.exportName}`));
  for (const alias of before.aliases)
    if (!aliasKeys.has(`${alias.file}#${alias.exportName}`))
      out.push(`CHK-22#registry-removed-alias:${id}:${alias.file}#${alias.exportName}`);
  return out;
}

const idOfFinding = finding => finding.split(':')[1];

function freshFor(base, head, id) {
  const fresh = multisetMinus(
    (head?.exceptions ?? []).map(exceptionKey),
    (base?.exceptions ?? []).map(exceptionKey)
  );
  return ['replaced', 'downgrade', 'added'].some(kind =>
    fresh.includes(exceptionKey({ check: 'CHK-22', item: `#registry:${id}`, kind }))
  );
}
