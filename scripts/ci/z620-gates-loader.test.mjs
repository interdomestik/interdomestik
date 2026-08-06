import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../..');
const LOGICAL_DIGEST = '2a42dcd2bf2ce836dec706710fc9303b5c11088ebfa342d5b97795f0422e1e97';
const TOP_LEVEL_KEYS = [
  'commandCoverage',
  'commandMetadata',
  'jobCommands',
  'jobCoverage',
  'lanes',
  'substitutableCommands',
  'version',
];

let loadZ620Gates;
try {
  ({ loadZ620Gates } = await import('./z620-gates-loader.mjs'));
} catch {
  // The first RED proves the loader does not exist yet.
}

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

test('split gate loader preserves the complete reviewed logical contract', () => {
  assert.equal(typeof loadZ620Gates, 'function', 'loader module must export loadZ620Gates');
  const gates = loadZ620Gates(root);
  const digest = createHash('sha256')
    .update(JSON.stringify(canonicalize(gates)))
    .digest('hex');

  assert.deepEqual(Object.keys(gates).sort(), TOP_LEVEL_KEYS);
  assert.equal(digest, LOGICAL_DIGEST);
  assert.deepEqual(gates.lanes.pilot.commands, ['pilot-run']);
  assert.deepEqual(gates.jobCoverage['.github/workflows/ci.yml#e2e-gate'], [
    'database',
    'e2e-merge',
  ]);
});

function copyGateFiles(targetRoot) {
  const targetDir = path.join(targetRoot, 'scripts/ci');
  fs.mkdirSync(targetDir, { recursive: true });
  for (const name of fs.readdirSync(path.join(root, 'scripts/ci'))) {
    if (name.startsWith('z620-gates') && name.endsWith('.json')) {
      fs.copyFileSync(path.join(root, 'scripts/ci', name), path.join(targetDir, name));
    }
  }
  return targetDir;
}

test('split gate loader rejects path, fragment, and top-level schema drift', t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-gates-loader-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const fixtureDir = copyGateFiles(fixtureRoot);
  const manifestPath = path.join(fixtureDir, 'z620-gates.json');
  const policyPath = path.join(fixtureDir, 'z620-gates-command-policy.json');
  const originalManifest = fs.readFileSync(manifestPath, 'utf8');
  const originalPolicy = fs.readFileSync(policyPath, 'utf8');

  const manifest = JSON.parse(originalManifest);
  manifest.fragments[0] = '../outside.json';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(() => loadZ620Gates(fixtureRoot), /GATE_MANIFEST_INVALID/u);

  fs.writeFileSync(manifestPath, originalManifest);
  const policy = JSON.parse(originalPolicy);
  policy.lanes = {};
  fs.writeFileSync(policyPath, JSON.stringify(policy));
  assert.throws(() => loadZ620Gates(fixtureRoot), /GATE_FRAGMENT_INVALID/u);

  fs.writeFileSync(policyPath, originalPolicy);
  const coveragePath = path.join(fixtureDir, 'z620-gates-command-coverage.json');
  const coverage = JSON.parse(fs.readFileSync(coveragePath, 'utf8'));
  coverage.unreviewed = true;
  fs.writeFileSync(coveragePath, JSON.stringify(coverage));
  assert.throws(() => loadZ620Gates(fixtureRoot), /GATE_FRAGMENT_INVALID/u);
});
