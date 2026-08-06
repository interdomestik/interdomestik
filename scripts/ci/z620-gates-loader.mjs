import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../..');
const MANIFEST_PATH = 'scripts/ci/z620-gates.json';
const FRAGMENTS = [
  ['z620-gates-lanes.json', ['jobCoverage', 'lanes']],
  ['z620-gates-command-policy.json', ['commandMetadata', 'substitutableCommands']],
  ['z620-gates-job-commands.json', ['jobCommands']],
  ['z620-gates-command-coverage.json', ['commandCoverage']],
];

function fail(code, relativePath = '') {
  throw new Error(relativePath ? `${code} ${relativePath}` : code);
}

function sameStrings(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function readReviewedJson(root, relativePath, expectedDigests, invalidCode) {
  const expected = expectedDigests?.[relativePath];
  if (typeof expected !== 'string') fail('GATE_SOURCE_DIGEST_MISMATCH', relativePath);
  let bytes;
  try {
    bytes = fs.readFileSync(path.join(root, relativePath));
  } catch {
    return fail('GATE_SOURCE_DIGEST_MISMATCH', relativePath);
  }
  const actual = createHash('sha256').update(bytes).digest('hex');
  if (actual !== expected) fail('GATE_SOURCE_DIGEST_MISMATCH', relativePath);
  try {
    return JSON.parse(bytes.toString('utf8'));
  } catch {
    return fail(invalidCode);
  }
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

export function loadZ620Gates(root = DEFAULT_ROOT, expectedDigests) {
  const manifest = readReviewedJson(root, MANIFEST_PATH, expectedDigests, 'GATE_MANIFEST_INVALID');
  const manifestKeys = Object.keys(manifest ?? {}).sort();
  const fragmentNames = FRAGMENTS.map(([name]) => name);
  if (
    !sameStrings(manifestKeys, ['fragments', 'version']) ||
    manifest.version !== 1 ||
    !sameStrings(manifest.fragments, fragmentNames)
  ) {
    fail('GATE_MANIFEST_INVALID');
  }
  const gates = { version: manifest.version };
  for (const [fragment, expectedKeys] of FRAGMENTS) {
    const relativePath = `scripts/ci/${fragment}`;
    const contents = readReviewedJson(root, relativePath, expectedDigests, 'GATE_FRAGMENT_INVALID');
    if (
      !contents ||
      typeof contents !== 'object' ||
      Array.isArray(contents) ||
      !sameStrings(Object.keys(contents).sort(), expectedKeys)
    ) {
      fail('GATE_FRAGMENT_INVALID');
    }
    Object.assign(gates, contents);
  }
  return deepFreeze(gates);
}
