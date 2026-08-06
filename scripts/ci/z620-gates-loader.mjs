import fs from 'node:fs';
import path from 'node:path';

const DEFAULT_ROOT = path.resolve(import.meta.dirname, '../..');
const FRAGMENTS = [
  ['z620-gates-lanes.json', ['jobCoverage', 'lanes']],
  ['z620-gates-command-policy.json', ['commandMetadata', 'substitutableCommands']],
  ['z620-gates-job-commands.json', ['jobCommands']],
  ['z620-gates-command-coverage.json', ['commandCoverage']],
];

function fail(code) {
  throw new Error(code);
}

function sameStrings(actual, expected) {
  return (
    Array.isArray(actual) &&
    actual.length === expected.length &&
    actual.every((value, index) => value === expected[index])
  );
}

function readJson(filePath, code) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return fail(code);
  }
}

export function loadZ620Gates(root = DEFAULT_ROOT) {
  const manifestPath = path.join(root, 'scripts/ci/z620-gates.json');
  const manifest = readJson(manifestPath, 'GATE_MANIFEST_INVALID');
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
    const fragmentPath = path.join(root, 'scripts/ci', fragment);
    const contents = readJson(fragmentPath, 'GATE_FRAGMENT_INVALID');
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
  return gates;
}
