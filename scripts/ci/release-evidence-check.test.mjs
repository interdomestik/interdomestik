import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';

const rootDir = path.resolve(new URL('../..', import.meta.url).pathname);
const checker = path.join(rootDir, 'scripts/release-evidence-check.mjs');

function run(manifestPath) {
  return spawnSync(process.execPath, [checker, '--manifest', manifestPath], {
    cwd: rootDir,
    encoding: 'utf8',
  });
}

test('release evidence check lists pending G-items', () => {
  const result = run('docs/release/production-evidence.yaml');

  assert.equal(result.status, 1);
  assert.match(result.stderr, /G01: status=pending/);
  assert.match(result.stderr, /G10: status=pending/);
});

test('release evidence check accepts supplied artifact with matching hash', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-evidence-'));
  try {
    const artifact = path.join(dir, 'artifact.txt');
    writeFileSync(artifact, 'signed test artifact\n');
    const manifest = path.join(dir, 'manifest.yaml');
    writeFileSync(
      manifest,
      [
        'gates:',
        ...Array.from({ length: 10 }, (_, index) => {
          const id = `G${String(index + 1).padStart(2, '0')}`;
          return [
            `  - id: ${id}`,
            `    description: test ${id}`,
            '    owner: test owner',
            '    status: supplied',
            '    required_artifacts:',
            `      - path: ${artifact}`,
            '        sha256: 4f88e320a5ef55568b5c6b9a55227d0f568e2da7d279f2b5123b4f28b20678aa',
            '    signoff: { name: test, role: test, signed_at: 2026-06-27 }',
          ].join('\n');
        }),
      ].join('\n')
    );

    const result = run(manifest);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /PASS gates=10/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
