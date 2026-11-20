// Transfers and rebuilt screens (WP-05 design §4.1, §4.2), over WP-02's baseline functions.
import { ScanError, byCodeUnit } from '../server-mutation/ast.mjs';
import { multisetMinus } from '../server-mutation/baseline.mjs';
import { isCanonicalSource } from './paths.mjs';

const exceptionKey = e => `${e.check}\u0000${e.item}\u0000${e.kind}`;
const isItemException = e => typeof e.item === 'string' && !e.item.startsWith('#');

// The key with its file part (the second `|` field) blanked, so two keys can be compared apart
// from the path.
const withoutFile = key => {
  const parts = key.split('|');
  if (parts.length < 3) return null;
  parts[1] = '';
  return parts.join('|');
};

// The head baseline with every fresh `replaced` item exception that cannot be paired dropped (B5,
// B12): it must carry `replaces`, differ from it only in the file path, and consume one occurrence
// of `replaces` from base-minus-head. Metadata exceptions (`#…`) keep WP-02's path unchanged.
export function pairTransfers(base, head) {
  if (!base) return { head, unpaired: [] };
  let pool = (base.exceptions ?? []).map(exceptionKey);
  const removed = new Map();
  const removedOf = id => {
    if (!removed.has(id))
      removed.set(id, multisetMinus(base.checks[id]?.items ?? [], head.checks[id]?.items ?? []));
    return removed.get(id);
  };
  const kept = [];
  const unpaired = [];
  for (const entry of head.exceptions) {
    const key = exceptionKey(entry);
    const index = pool.indexOf(key);
    if (index >= 0) {
      pool = [...pool.slice(0, index), ...pool.slice(index + 1)];
      kept.push(entry);
      continue;
    }
    if (entry.kind !== 'replaced' || !isItemException(entry)) {
      kept.push(entry);
      continue;
    }
    const occurrences = removedOf(entry.check);
    const at = typeof entry.replaces === 'string' ? occurrences.indexOf(entry.replaces) : -1;
    const sameApartFromFile =
      at >= 0 &&
      withoutFile(entry.replaces) !== null &&
      withoutFile(entry.replaces) === withoutFile(entry.item);
    if (sameApartFromFile) {
      occurrences.splice(at, 1);
      kept.push(entry);
    } else unpaired.push(`${entry.check}#unpaired-transfer:${entry.item}`);
  }
  return { head: { ...head, exceptions: kept }, unpaired };
}

export const REBUILT_PATH = 'scripts/ci/screen-contract/rebuilt-screens.json';

// A canonical repository path of a source file under a linted root (`paths.mjs`).
const isCanonical = isCanonicalSource;

// A rebuilt file the head adds to the list must be a screen the head lints; an entry the trusted
// base already lists stays valid after its file is gone.
export function rebuiltDeclarationErrors(baseList, headList, files, roleOf) {
  const known = new Set(baseList ?? []);
  const present = new Set(files);
  return headList
    .filter(file => !known.has(file))
    .filter(file => !present.has(file) || roleOf(file) !== 'screen')
    .map(file => `the rebuilt-screens list names ${file}, which is not a screen of the head`);
}

export function parseRebuilt(text, label) {
  if (typeof text !== 'string' || !text.trim())
    throw new ScanError(`${label} rebuilt-screens list is missing or empty`);
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new ScanError(`${label} rebuilt-screens list is not valid JSON`);
  }
  if (!Array.isArray(data) || !data.every(file => typeof file === 'string' && file))
    throw new ScanError(`${label} rebuilt-screens list is not a list of paths`);
  const odd = data.find(file => !isCanonical(file));
  if (odd !== undefined)
    throw new ScanError(`${label} rebuilt-screens list names a non-canonical path ${odd}`);
  if (new Set(data).size !== data.length)
    throw new ScanError(`${label} rebuilt-screens list has duplicates`);
  return [...data].sort(byCodeUnit);
}

const fileOfKey = key => key.split('|')[1] ?? '';

// A rebuilt file admits no item (§4.2): its baseline entries are findings, and its scan items are
// never admitted. Returns the items to admit and the findings.
export function applyRebuilt(id, admitted, rebuilt) {
  const listed = new Set(rebuilt);
  const kept = [];
  const findings = [];
  for (const item of admitted)
    if (listed.has(fileOfKey(item))) findings.push(`${id}#rebuilt-baselined:${item}`);
    else kept.push(item);
  return { admitted: kept, findings };
}

// The list only grows: a removal needs the owner's fresh `#rebuilt:<file>` exception.
export function rebuiltRemovals(baseList, headList, base, head) {
  if (!baseList) return [];
  const fresh = multisetMinus(
    (head?.exceptions ?? []).map(exceptionKey),
    (base?.exceptions ?? []).map(exceptionKey)
  );
  const headSet = new Set(headList);
  return baseList
    .filter(file => !headSet.has(file))
    .filter(
      file =>
        !fresh.includes(
          exceptionKey({ check: 'rebuilt', item: `#rebuilt:${file}`, kind: 'downgrade' })
        )
    )
    .map(file => `rebuilt#removed:${file}`);
}
