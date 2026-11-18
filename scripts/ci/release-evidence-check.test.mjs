import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import yaml from 'js-yaml';
import { structuredArtifactOwner } from '../modularity-guard-policy.mjs';

const rootDir = path.resolve(new URL('../..', import.meta.url).pathname);
const checker = path.join(rootDir, 'scripts/release-evidence-check.mjs');
const ARTIFACT_TEXT = 'signed test artifact\n';
const ARTIFACT_SHA = createHash('sha256').update(ARTIFACT_TEXT).digest('hex');

function run(args) {
  return spawnSync(process.execPath, [checker, ...args], { cwd: rootDir, encoding: 'utf8' });
}

function gateLines(id, overrides = {}) {
  const artifact = overrides.artifact ?? [`file: ${id}-evidence.pdf`, `sha256: ${ARTIFACT_SHA}`];
  const signoff =
    overrides.signoff ?? `{ signer_ref: T503-${id}, role: release owner, signed_at: 2026-07-02 }`;
  return [
    `  - id: ${id}`,
    `    description: test ${id}`,
    '    owner: release owner',
    `    status: ${overrides.status ?? 'supplied'}`,
    '    required_artifacts:',
    `      - ${artifact[0]}`,
    ...artifact.slice(1).map(line => `        ${line}`),
    `    signoff: ${signoff}`,
  ].join('\n');
}

function withManifest(gateOverrides, callback) {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-evidence-'));
  try {
    const evidenceRoot = path.join(dir, 'store');
    const ids = Array.from({ length: 10 }, (_, index) => `G${String(index + 1).padStart(2, '0')}`);
    mkdirSync(evidenceRoot);
    for (const id of ids)
      writeFileSync(path.join(evidenceRoot, `${id}-evidence.pdf`), ARTIFACT_TEXT);
    const manifest = path.join(dir, 'manifest.yaml');
    const gates = ids.map(id => gateLines(id, gateOverrides(id)));
    writeFileSync(manifest, ['gates:', ...gates].join('\n'));
    callback({ manifest, evidenceRoot });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('release evidence check lists pending G-items', () => {
  withManifest(
    () => ({ status: 'pending' }),
    ({ manifest }) => {
      const result = run(['--manifest', manifest]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /G01: status=pending/);
      assert.match(result.stderr, /G10: status=pending/);
    }
  );
});

test('a complete hash manifest passes without an evidence root and says files are unverified', () => {
  withManifest(
    () => ({}),
    ({ manifest }) => {
      const result = run(['--manifest', manifest]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /PASS gates=10 files=not-verified/);
    }
  );
});

test('an evidence root verifies supplied and waived files against their hashes', () => {
  withManifest(
    id => (id === 'G04' ? { status: 'waived' } : {}),
    ({ manifest, evidenceRoot }) => {
      const result = run(['--manifest', manifest, '--evidence-root', evidenceRoot]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /PASS gates=10 files=verified/);
    }
  );
});

test('an evidence root refuses a changed or missing file', () => {
  withManifest(
    () => ({}),
    ({ manifest, evidenceRoot }) => {
      writeFileSync(path.join(evidenceRoot, 'G02-evidence.pdf'), 'changed\n');
      rmSync(path.join(evidenceRoot, 'G07-evidence.pdf'));
      const result = run(['--manifest', manifest, '--evidence-root', evidenceRoot]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /G02: sha256 mismatch for G02-evidence\.pdf/);
      assert.match(result.stderr, /G07: evidence file not found: G07-evidence\.pdf/);
    }
  );
});

test('an evidence root that is not a directory stops the check', () => {
  withManifest(
    () => ({}),
    ({ manifest, evidenceRoot }) => {
      const result = run([
        '--manifest',
        manifest,
        '--evidence-root',
        path.join(evidenceRoot, 'none'),
      ]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /evidence root is not a directory/);
    }
  );
});

test('hashes must be 64 hex characters even without an evidence root', () => {
  withManifest(
    id => (id === 'G03' ? { artifact: ['file: G03-evidence.pdf', 'sha256: pending'] } : {}),
    ({ manifest }) => {
      const result = run(['--manifest', manifest]);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /G03: artifact G03-evidence\.pdf sha256 must be 64 hex characters/
      );
    }
  );
});

test('artifacts name a plain file in the store, never a repository path', () => {
  const cases = {
    G01: [`path: docs/release/evidence/G01.pdf`, `sha256: ${ARTIFACT_SHA}`],
    G02: [`file: ../G02-evidence.pdf`, `sha256: ${ARTIFACT_SHA}`],
    G03: [`file: nested/G03-evidence.pdf`, `sha256: ${ARTIFACT_SHA}`],
  };
  withManifest(
    id => (cases[id] ? { artifact: cases[id] } : {}),
    ({ manifest, evidenceRoot }) => {
      const result = run(['--manifest', manifest, '--evidence-root', evidenceRoot]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /G01: artifact path is not accepted/);
      assert.match(result.stderr, /G02: artifact file must be a plain file name/);
      assert.match(result.stderr, /G03: artifact file must be a plain file name/);
    }
  );
});

test('signoff records an opaque signer reference and refuses names and emails', () => {
  const cases = {
    G05: '{ name: Test Person, signer_ref: T503-G05, role: owner, signed_at: 2026-07-02 }',
    G06: '{ email: someone@example.test, signer_ref: T503-G06, role: owner, signed_at: 2026-07-02 }',
    G08: '{ role: owner, signed_at: 2026-07-02 }',
  };
  withManifest(
    id => (cases[id] ? { signoff: cases[id] } : {}),
    ({ manifest }) => {
      const result = run(['--manifest', manifest]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /G05: signoff\.name must not be recorded here/);
      assert.match(result.stderr, /G06: signoff\.email must not be recorded here/);
      assert.match(result.stderr, /G08: signoff\.signer_ref is missing or pending/);
    }
  );
});

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
  const result = run([]);
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /PASS gates=10 files=not-verified/);
});

test('the release evidence manifests have a registered modularity owner', () => {
  for (const file of [
    'docs/release/production-evidence.yaml',
    'docs/release/t503-evidence-intake/manifest-patch-example.yaml',
  ]) {
    assert.equal(structuredArtifactOwner(file), 'release-evidence-hash-manifest-contract');
  }
  assert.equal(structuredArtifactOwner('docs/release/other-evidence.yaml'), null);
});
