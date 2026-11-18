import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const checker = path.join(rootDir, 'scripts/release-evidence-check.mjs');
const ARTIFACT_TEXT = 'signed test artifact\n';
const ARTIFACT_SHA = createHash('sha256').update(ARTIFACT_TEXT).digest('hex');

function run(args, env = {}, cwd = rootDir) {
  return spawnSync(process.execPath, [checker, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
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
    mkdirSync(path.join(dir, 'docs/release'), { recursive: true });
    const gates = ids.map(id => gateLines(id, gateOverrides(id)));
    writeFileSync(
      path.join(dir, 'docs/release/production-evidence.yaml'),
      ['gates:', ...gates].join('\n')
    );
    callback({ evidenceRoot, check: (args, env) => run(args, env, dir) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test('release evidence check lists pending G-items', () => {
  withManifest(
    () => ({ status: 'pending' }),
    ({ check }) => {
      const result = check(['--manifest-only']);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /G01: status=pending/);
      assert.match(result.stderr, /G10: status=pending/);
    }
  );
});

test('a complete hash manifest passes without an evidence root and says files are unverified', () => {
  withManifest(
    () => ({}),
    ({ check }) => {
      const result = check(['--manifest-only']);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /PASS gates=10 files=not-verified/);
    }
  );
});

test('an evidence root verifies supplied and waived files against their hashes', () => {
  withManifest(
    id => (id === 'G04' ? { status: 'waived' } : {}),
    ({ check, evidenceRoot }) => {
      const result = check(['--evidence-root', evidenceRoot]);
      assert.equal(result.status, 0, result.stderr);
      assert.match(result.stdout, /PASS gates=10 files=verified/);
    }
  );
});

test('an evidence root refuses a changed or missing file', () => {
  withManifest(
    () => ({}),
    ({ check, evidenceRoot }) => {
      writeFileSync(path.join(evidenceRoot, 'G02-evidence.pdf'), 'changed\n');
      rmSync(path.join(evidenceRoot, 'G07-evidence.pdf'));
      const result = check(['--evidence-root', evidenceRoot]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /G02: sha256 mismatch for G02-evidence\.pdf/);
      assert.match(result.stderr, /G07: evidence file not found: G07-evidence\.pdf/);
    }
  );
});

test('an evidence root that is not a directory stops the check', () => {
  withManifest(
    () => ({}),
    ({ check, evidenceRoot }) => {
      const result = check(['--evidence-root', path.join(evidenceRoot, 'none')]);
      assert.equal(result.status, 2);
      assert.match(result.stderr, /evidence root is not a directory/);
    }
  );
});

test('hashes must be 64 hex characters even without an evidence root', () => {
  withManifest(
    id => (id === 'G03' ? { artifact: ['file: G03-evidence.pdf', 'sha256: pending'] } : {}),
    ({ check }) => {
      const result = check(['--manifest-only']);
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
    ({ check, evidenceRoot }) => {
      const result = check(['--evidence-root', evidenceRoot]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /G01: artifact path is not accepted/);
      assert.match(result.stderr, /G02: artifact file must be a plain file name/);
      assert.match(result.stderr, /G03: artifact file must be a plain file name/);
    }
  );
});

test('signoff records an opaque text signer reference and refuses names and emails', () => {
  const tail = 'role: owner, signed_at: 2026-07-02';
  const cases = {
    G05: [`{ name: Test Person, signer_ref: T503-G05, ${tail} }`, 'name must not be recorded here'],
    G06: [`{ email: a@example.test, signer_ref: T503-G06, ${tail} }`, 'email must not be recorded'],
    G07: [`{ signer_ref: { name: Test Person }, ${tail} }`, 'signer_ref must be text'],
    G08: [`{ ${tail} }`, 'signer_ref is missing or pending'],
    G09: [`{ signer_ref: [T503-G09], ${tail} }`, 'signer_ref must be text'],
    G10: [
      '{ signer_ref: T503-G10, role: { name: Test Person }, signed_at: 2026-07-02 }',
      'role must be text',
    ],
  };
  withManifest(
    id => (cases[id] ? { signoff: cases[id][0] } : {}),
    ({ check }) => {
      const result = check(['--manifest-only']);
      assert.equal(result.status, 1);
      for (const [id, [, message]] of Object.entries(cases)) {
        assert.ok(result.stderr.includes(`${id}: signoff.${message}`), `${id}: ${result.stderr}`);
      }
    }
  );
});

test('a malformed option stops the check instead of skipping file verification', () => {
  withManifest(
    () => ({}),
    ({ check, evidenceRoot }) => {
      for (const args of [
        [],
        ['--manifest-only', '--evidence-root', evidenceRoot],
        ['--evidence-root'],
        ['--evidence-root', ''],
        ['--evidence-root='],
        ['--evidence-root', '--manifest-only'],
        ['--evidence-root', evidenceRoot, '--evidence-root='],
        ['--manifest-only', '--manifest-only'],
        ['--manifest-only=yes'],
        ['--manifest', 'docs/release/production-evidence.yaml', '--manifest-only'],
        ['--evidence-dir', evidenceRoot],
        [evidenceRoot],
        ['--', '--evidence-root', evidenceRoot],
      ]) {
        const result = check(args);
        assert.equal(result.status, 2, `${JSON.stringify(args)}: ${result.stdout}`);
        assert.match(result.stderr, /FAIL invalid arguments/);
        assert.doesNotMatch(result.stdout, /PASS/);
      }
    }
  );
});

test('the equals form of an option is honoured', () => {
  withManifest(
    () => ({}),
    ({ check, evidenceRoot }) => {
      rmSync(path.join(evidenceRoot, 'G06-evidence.pdf'));
      const result = check([`--evidence-root=${evidenceRoot}`]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /G06: evidence file not found: G06-evidence\.pdf/);
    }
  );
});

test('an evidence file that is a link is refused, even when its target matches the hash', () => {
  withManifest(
    () => ({}),
    ({ check, evidenceRoot }) => {
      const outside = path.join(path.dirname(evidenceRoot), 'outside.pdf');
      writeFileSync(outside, ARTIFACT_TEXT);
      rmSync(path.join(evidenceRoot, 'G04-evidence.pdf'));
      symlinkSync(outside, path.join(evidenceRoot, 'G04-evidence.pdf'));
      const result = check(['--evidence-root', evidenceRoot]);
      assert.equal(result.status, 1);
      assert.match(result.stderr, /G04: evidence file must be a regular file: G04-evidence\.pdf/);
    }
  );
});

test('a hash must be a string, not a list holding one', () => {
  withManifest(
    id =>
      id === 'G09' ? { artifact: ['file: G09-evidence.pdf', `sha256: [${ARTIFACT_SHA}]`] } : {},
    ({ check }) => {
      const result = check(['--manifest-only']);
      assert.equal(result.status, 1);
      assert.match(
        result.stderr,
        /G09: artifact G09-evidence\.pdf sha256 must be 64 hex characters/
      );
    }
  );
});

test('options pnpm took as its own configuration stop the check', () => {
  withManifest(
    () => ({}),
    ({ check, evidenceRoot }) => {
      // pnpm keeps the case and spelling of .npmrc keys; npm folds CLI names to lower case.
      for (const key of [
        'npm_config_evidence_root',
        'npm_config_Evidence_Root',
        'npm_config_evidenceRoot',
        'npm_config_evidenceroot',
        'NPM_CONFIG_EVIDENCE-ROOT',
        'npm_config_Manifest',
        'npm_config_manifest_only',
      ]) {
        for (const value of [evidenceRoot, '']) {
          const result = check(['--manifest-only'], { [key]: value });
          assert.equal(result.status, 2, `${key}=${value}: ${result.stdout}`);
          assert.match(result.stderr, /FAIL invalid arguments: .* write options after the script/);
        }
      }
      assert.equal(check(['--manifest-only'], { npm_config_evidence: evidenceRoot }).status, 0);
    }
  );
});
