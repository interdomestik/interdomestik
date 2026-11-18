import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

// Shared fixture for the release evidence checker tests: a temporary checkout holding a manifest
// of ten gates and a store with one matching evidence file per gate.
const rootDir = fileURLToPath(new URL('../..', import.meta.url));
const checker = path.join(rootDir, 'scripts/release-evidence-check.mjs');
export const ARTIFACT_TEXT = 'signed test artifact\n';
export const ARTIFACT_SHA = createHash('sha256').update(ARTIFACT_TEXT).digest('hex');
export const GATE_IDS = Array.from(
  { length: 10 },
  (_, index) => `G${String(index + 1).padStart(2, '0')}`
);

function run(args, env, cwd) {
  return spawnSync(process.execPath, [checker, ...args], {
    cwd,
    encoding: 'utf8',
    env: { ...process.env, ...env },
  });
}

// Overrides: artifact (lines), signoff (flow mapping), status, description, owner, extra (lines).
export function gateLines(id, overrides = {}) {
  const artifact = overrides.artifact ?? [`file: ${id}-evidence.pdf`, `sha256: ${ARTIFACT_SHA}`];
  const signoff =
    overrides.signoff ?? `{ signer_ref: T503-${id}, role: release owner, signed_at: 2026-07-02 }`;
  return [
    `  - id: ${id}`,
    `    description: ${overrides.description ?? `test ${id}`}`,
    `    owner: ${overrides.owner ?? 'release owner'}`,
    `    status: ${overrides.status ?? 'supplied'}`,
    '    required_artifacts:',
    `      - ${artifact[0]}`,
    ...artifact.slice(1).map(line => `        ${line}`),
    `    signoff: ${signoff}`,
    ...(overrides.extra ?? []).map(line => `    ${line}`),
  ].join('\n');
}

// `header` lines precede `gates:`; `extraGates` are appended after the ten expected gates.
export function withManifest(gateOverrides, callback, { header = [], extraGates = [] } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'release-evidence-'));
  try {
    const evidenceRoot = path.join(dir, 'store');
    mkdirSync(evidenceRoot);
    for (const id of GATE_IDS)
      writeFileSync(path.join(evidenceRoot, `${id}-evidence.pdf`), ARTIFACT_TEXT);
    mkdirSync(path.join(dir, 'docs/release'), { recursive: true });
    const gates = GATE_IDS.map(id => gateLines(id, gateOverrides(id)));
    writeFileSync(
      path.join(dir, 'docs/release/production-evidence.yaml'),
      [...header, 'gates:', ...gates, ...extraGates].join('\n')
    );
    callback({ evidenceRoot, check: (args, env = {}) => run(args, env, dir) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
