import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';
import yaml from 'js-yaml';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

// The repository's release evidence manifest, schema and modularity ownership.
const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const checker = path.join(rootDir, 'scripts/release-evidence-check.mjs');

function run(args) {
  return spawnSync(process.execPath, [checker, ...args], { cwd: rootDir, encoding: 'utf8' });
}

test('the repository manifest is a hash manifest without names or repository paths', () => {
  const manifestPath = path.join(rootDir, 'docs/release/production-evidence.yaml');
  const gates = yaml.load(readFileSync(manifestPath, 'utf8')).gates;
  assert.equal(gates.length, 10);
  for (const gate of gates) {
    assert.deepEqual(Object.keys(gate.signoff).sort(), ['role', 'signed_at', 'signer_ref']);
    for (const artifact of gate.required_artifacts) {
      assert.deepEqual(Object.keys(artifact).sort(), ['file', 'sha256']);
    }
  }
  const result = run(['--manifest-only']);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS gates=10 files=not-verified \(manifest only\)/);
});

test('the release evidence manifests have a registered modularity owner', () => {
  for (const file of [
    'docs/release/production-evidence.yaml',
    'docs/release/t503-evidence-intake/manifest-patch-example.yaml',
    'docs/release/production-evidence.schema.json',
  ]) {
    assert.equal(structuredArtifactOwner(file), 'release-evidence-hash-manifest-contract');
  }
  assert.equal(structuredArtifactOwner('docs/release/other-evidence.yaml'), null);
});

test('the published schema requires the hash-manifest fields and refuses the retired ones', () => {
  const schemaPath = path.join(rootDir, 'docs/release/production-evidence.schema.json');
  const gate = JSON.parse(readFileSync(schemaPath, 'utf8')).properties.gates.items.properties;
  const artifact = gate.required_artifacts.items;
  assert.deepEqual(artifact.required, ['file', 'sha256']);
  assert.equal(artifact.additionalProperties, false);
  assert.deepEqual(gate.signoff.required, ['signer_ref', 'role', 'signed_at']);
  assert.equal(gate.signoff.additionalProperties, false);
  assert.equal('name' in gate.signoff.properties, false);
  assert.equal('path' in artifact.properties, false);
});
