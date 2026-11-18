import { createHash } from 'node:crypto';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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

// The checker accepts only this header comment above the canonical manifest body.
const MANIFEST_HEADER = readFileSync(
  path.join(rootDir, 'docs/release/production-evidence.yaml'),
  'utf8'
)
  .split('\n')
  .filter((line, index, lines) => lines.slice(0, index + 1).every(each => each.startsWith('#')));

// Without overrides the lines are canonical. Overrides: artifact (lines), signoff (a flow mapping,
// not canonical), status, description, owner, extra (lines).
export function gateLines(id, overrides = {}) {
  const artifact = overrides.artifact ?? [`file: ${id}-evidence.pdf`, `sha256: ${ARTIFACT_SHA}`];
  const signoff =
    overrides.signoff ??
    ['', `signer_ref: T503-${id}-SIGNOFF`, 'role: release owner', 'signed_at: 2026-07-02'].join(
      '\n      '
    );
  const description = overrides.description ?? 'test ' + id;
  return [
    `  - id: ${id}`,
    `    description: ${description}`,
    `    owner: ${overrides.owner ?? 'release owner'}`,
    `    status: ${overrides.status ?? 'supplied'}`,
    '    required_artifacts:',
    `      - ${artifact[0]}`,
    ...artifact.slice(1).map(line => `        ${line}`),
    `    signoff:${overrides.signoff ? ' ' : ''}${signoff}`,
    ...(overrides.extra ?? []).map(line => `    ${line}`),
  ].join('\n');
}

// `header` lines follow the fixed header comment and precede `gates:`; `extraGates` are appended
// after the ten expected gates; `fixedHeader: false` leaves the header comment out.
export function withManifest(
  gateOverrides,
  callback,
  { header = [], extraGates = [], fixedHeader = true } = {}
) {
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
      [
        ...(fixedHeader ? MANIFEST_HEADER : []),
        ...header,
        'gates:',
        ...gates,
        ...extraGates,
        '',
      ].join('\n')
    );
    callback({ evidenceRoot, check: (args, env = {}) => run(args, env, dir) });
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
