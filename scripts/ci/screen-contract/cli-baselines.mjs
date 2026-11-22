import { ScanError } from '../server-mutation/ast.mjs';
import { parseBaseline, removalRecorded, removedChecks } from '../server-mutation/baseline.mjs';
import { showAt } from '../server-mutation/git.mjs';
import { BASELINE_PATH, CHECKS, SCRIPT_PATH } from './evaluate.mjs';
import { REGISTRY_PATH, parseRegistry } from './registry.mjs';
import { readInside } from './paths.mjs';
import { REBUILT_PATH, parseRebuilt } from './transfer.mjs';

const EVALUATE_PATH = 'scripts/ci/screen-contract/evaluate.mjs';

function readBaseBaseline(repo, baseSha, only, synthesized) {
  if (synthesized)
    return parseBaseline(JSON.stringify(synthesized), 'base', CHECKS, { trustedBase: true, only });
  const baseText = showAt(repo, baseSha, BASELINE_PATH);
  if (baseText !== null)
    return parseBaseline(baseText, 'base', CHECKS, { trustedBase: true, only });
  if (showAt(repo, baseSha, SCRIPT_PATH) !== null)
    throw new ScanError('base has the scanner but no baseline');
  return null;
}

// A pre-adoption head (replay only) has no baseline; it is judged against its base's synthesized one.
function readHeadBaseline(root, only, synthesized) {
  const text = readInside(root, BASELINE_PATH) ?? (synthesized ? JSON.stringify(synthesized) : '');
  return parseBaseline(text, 'head', CHECKS, { only });
}

function assertChecksPresent(repo, baseSha, { base, head }, scope) {
  if (!scope && base && !Object.keys(base.checks).length)
    throw new ScanError('base baseline names no check');
  if (!scope && !Object.keys(head.checks).length)
    throw new ScanError('head baseline names no check');
  for (const check of scope ? [scope] : CHECKS) {
    const removed = removalRecorded(base, check.id);
    // A check new in this head is absent from a base whose scanner never ran it (WP-02's rule).
    const baseRan = (showAt(repo, baseSha, EVALUATE_PATH) ?? '').includes(`id: '${check.id}'`);
    if (base && !base.checks[check.id] && !removed && baseRan)
      throw new ScanError(`base baseline has no ${check.id}`);
    // An absent check is an error unless the owner's removal is recorded (design §5).
    if (!head.checks[check.id] && !removed && !removalRecorded(head, check.id))
      throw new ScanError(`head baseline has no ${check.id}`);
  }
}

function assertRemovalsKept({ base, head }, only) {
  for (const id of removedChecks(base))
    if (
      (only === null || id === only) &&
      !base.checks[id] &&
      !head.checks[id] &&
      !removalRecorded(head, id)
    )
      throw new ScanError(`head baseline drops the recorded removal of ${id}`);
}

// The baselines, as WP-02's CLI reads them, over WP-02's functions (design §3 "WP-05's own code").
export function readBaselines(repo, root, baseSha, scope, synthesized = null) {
  const only = scope?.id ?? null;
  const base = readBaseBaseline(repo, baseSha, only, synthesized);
  const head = readHeadBaseline(root, only, synthesized);
  assertChecksPresent(repo, baseSha, { base, head }, scope);
  assertRemovalsKept({ base, head }, only);
  return {
    base,
    head,
    bootstrap: base === null,
    authority: rebuiltAuthority(repo, root, baseSha, scope, { base, head }),
  };
}

// The owner's `rebuilt` exceptions. A scoped run parses each baseline with that check's exceptions
// only, so the rebuilt ones are read on their own (r1 B9); WP-02's parser validates them.
function rebuiltAuthority(repo, root, baseSha, scope, { base, head }) {
  if (!scope) return { base, head };
  const only = { only: 'rebuilt' };
  const baseText = base ? showAt(repo, baseSha, BASELINE_PATH) : null;
  return {
    base:
      baseText === null
        ? base
        : parseBaseline(baseText, 'base', CHECKS, { trustedBase: true, ...only }),
    head: parseBaseline(readInside(root, BASELINE_PATH) ?? '', 'head', CHECKS, only),
  };
}

// The base's registry and rebuilt list come from the trusted base commit, or, for a replay of a
// pre-adoption pair, from its extracted and synthesized base tree.
export function readTrustedInputs(repo, root, baseSha, baseRoot = null) {
  const atBase = rel => (baseRoot ? readInside(baseRoot, rel) : showAt(repo, baseSha, rel));
  const baseRegistryText = atBase(REGISTRY_PATH);
  const baseRebuiltText = atBase(REBUILT_PATH);
  return {
    baseRegistry:
      baseRegistryText === null ? null : parseRegistry(baseRegistryText, 'base consent registry'),
    baseRebuilt: baseRebuiltText === null ? null : parseRebuilt(baseRebuiltText, 'base'),
    rebuilt: parseRebuilt(readInside(root, REBUILT_PATH) ?? '', 'head'),
  };
}
