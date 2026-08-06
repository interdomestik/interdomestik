import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { loadZ620Gates } from './z620-gates-loader.mjs';

const root = path.resolve(import.meta.dirname, '../..');
const parity = JSON.parse(fs.readFileSync(path.join(root, 'scripts/ci/z620-parity.json')));
const LOGICAL_DIGEST = '917c106609a10afcfa475c4cc854abb53c5492d4a291ad28b768e0cdcfc3da8b';
const GATE_FILES = [
  'z620-gates.json',
  'z620-gates-lanes.json',
  'z620-gates-command-policy.json',
  'z620-gates-job-commands.json',
  'z620-gates-command-coverage.json',
];

function canonicalize(value) {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(
    Object.keys(value)
      .sort()
      .map(key => [key, canonicalize(value[key])])
  );
}

function digest(value) {
  return createHash('sha256').update(value).digest('hex');
}

function copyGateFiles(targetRoot) {
  const targetDir = path.join(targetRoot, 'scripts/ci');
  fs.mkdirSync(targetDir, { recursive: true });
  for (const name of GATE_FILES) {
    fs.copyFileSync(path.join(root, 'scripts/ci', name), path.join(targetDir, name));
  }
  return targetDir;
}

function fixtureDigests(fixtureRoot) {
  return Object.fromEntries(
    GATE_FILES.map(name => {
      const relative = `scripts/ci/${name}`;
      return [relative, digest(fs.readFileSync(path.join(fixtureRoot, relative)))];
    })
  );
}

function assertDeepFrozen(value) {
  assert.equal(Object.isFrozen(value), true);
  if (value && typeof value === 'object') {
    for (const child of Object.values(value)) assertDeepFrozen(child);
  }
}

test('reviewed bytes load as the canonical deeply immutable gate graph', () => {
  const gates = loadZ620Gates(root, parity.sourceDigests);
  assert.equal(digest(JSON.stringify(canonicalize(gates))), LOGICAL_DIGEST);
  assertDeepFrozen(gates);
  assert.throws(() => gates.lanes.audit.commands.push('unreviewed'), TypeError);
});

test('digest mismatch is rejected before malformed fragment bytes are parsed', t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-gates-loader-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const fixtureDir = copyGateFiles(fixtureRoot);
  const expected = fixtureDigests(fixtureRoot);
  fs.writeFileSync(path.join(fixtureDir, 'z620-gates-command-policy.json'), '{invalid');
  assert.throws(
    () => loadZ620Gates(fixtureRoot, expected),
    /GATE_SOURCE_DIGEST_MISMATCH.*z620-gates-command-policy\.json/u
  );
});

test('mixed-version fragments fail against one reviewed digest inventory', t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-gates-mixed-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const fixtureDir = copyGateFiles(fixtureRoot);
  const expected = fixtureDigests(fixtureRoot);
  const coveragePath = path.join(fixtureDir, 'z620-gates-command-coverage.json');
  const coverage = JSON.parse(fs.readFileSync(coveragePath));
  coverage.commandCoverage['coverage-gate'] = ['.github/workflows/ci.yml#audit'];
  fs.writeFileSync(coveragePath, JSON.stringify(coverage));
  assert.throws(
    () => loadZ620Gates(fixtureRoot, expected),
    /GATE_SOURCE_DIGEST_MISMATCH.*z620-gates-command-coverage\.json/u
  );
});

test('reviewed but structurally invalid manifest and fragments still fail closed', t => {
  const fixtureRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'z620-gates-schema-'));
  t.after(() => fs.rmSync(fixtureRoot, { recursive: true, force: true }));
  const fixtureDir = copyGateFiles(fixtureRoot);
  const manifestPath = path.join(fixtureDir, 'z620-gates.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath));
  manifest.fragments[0] = '../outside.json';
  fs.writeFileSync(manifestPath, JSON.stringify(manifest));
  assert.throws(
    () => loadZ620Gates(fixtureRoot, fixtureDigests(fixtureRoot)),
    /GATE_MANIFEST_INVALID/u
  );

  copyGateFiles(fixtureRoot);
  const policyPath = path.join(fixtureDir, 'z620-gates-command-policy.json');
  const policy = JSON.parse(fs.readFileSync(policyPath));
  policy.lanes = {};
  fs.writeFileSync(policyPath, JSON.stringify(policy));
  assert.throws(
    () => loadZ620Gates(fixtureRoot, fixtureDigests(fixtureRoot)),
    /GATE_FRAGMENT_INVALID/u
  );
});
