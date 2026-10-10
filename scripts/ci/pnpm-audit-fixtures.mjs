import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { after } from 'node:test';
import { fileURLToPath } from 'node:url';

// Shared fixtures for scripts/ci/pnpm-audit-*.test.mjs. Deliberately not named
// *.test.mjs so test discovery never runs it alone. It never imports the gate:
// gates only run as subprocesses. Temp directories are removed when the importing
// test process finishes.

export const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
const scriptsDir = path.join(repoRoot, 'scripts');
export const realGate = path.join(scriptsDir, 'pnpm-audit-gate.mjs');
export const workflowPath = path.join(repoRoot, '.github', 'workflows', 'security.yml');

// Every gate source module must be copied, since the gate imports its siblings.
const GATE_MODULES = ['pnpm-audit-gate.mjs', 'pnpm-audit-input.mjs'];

export const PATH_A = 'apps__web>example-lib>dep-a';
export const PATH_B = 'apps__web>example-lib>dep-b';
export const REAL_SCOPED_PATH = 'apps__web>better-auth>vitest>vite';
export const COMPLETENESS = /conservative completeness policy/;

export const ERROR_VALUES = {
  error: { code: 'ERR_PNPM_AUDIT_BAD_RESPONSE', message: 'endpoint responded 500' },
  errors: [{ message: 'registry unavailable' }],
  code: 'ERR_PNPM_AUDIT_BAD_RESPONSE',
  message: 'The audit endpoint responded with 500',
  status: 500,
  statusCode: 500,
};

export const SCOPED_ALLOWLIST = {
  allowlist: [
    '1000001',
    1000002,
    'GHSA-test-1000003',
    { id: '1000010', path: PATH_A },
    { id: '1000011', paths: [PATH_A, PATH_B] },
    { ghsaId: 'GHSA-scop-ed00-0012', path: PATH_A },
  ],
};

const tempDirs = [];
after(() => {
  tempDirs.forEach(dir => fs.rmSync(dir, { recursive: true, force: true }));
});

export function tempDir() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'pnpm-audit-gate-'));
  tempDirs.push(dir);
  return dir;
}

// The gate reads its sibling allowlist file, so copy it next to a controlled one.
export function makeGate(allowlist) {
  const dir = tempDir();
  for (const file of GATE_MODULES) {
    fs.copyFileSync(path.join(scriptsDir, file), path.join(dir, file));
  }
  if (allowlist !== undefined) {
    const text = typeof allowlist === 'string' ? allowlist : JSON.stringify(allowlist);
    fs.writeFileSync(path.join(dir, 'pnpm-audit-allowlist.json'), text);
  }
  return path.join(dir, 'pnpm-audit-gate.mjs');
}

export function runGate(gate, input, args = []) {
  return spawnSync(process.execPath, [gate, ...args], { input, encoding: 'utf8' });
}

export function assertPass(result) {
  assert.equal(result.status, 0, `expected pass, stderr:\n${result.stderr}`);
}

export function assertBlocked(result, pattern) {
  assert.equal(result.status, 1, `expected failure, stdout:\n${result.stdout}`);
  assert.match(result.stderr, /pnpm audit gate failed/);
  if (pattern) assert.match(result.stderr, pattern);
}

// Mirrors the pnpm 10 advisory record shape, including free-text prose fields.
export function advisory(id, severity, paths = [PATH_A], extra = {}) {
  return {
    id,
    title: 'Example advisory',
    module_name: 'example-lib',
    severity,
    github_advisory_id: `GHSA-test-${id}`,
    cves: [],
    vulnerable_versions: '<1.0.1',
    patched_versions: '>=1.0.1',
    overview: 'Prose describing the issue.',
    recommendation: 'Upgrade to version 1.0.1 or later',
    references: '- https://example.invalid/advisory',
    url: `https://github.com/advisories/GHSA-test-${id}`,
    findings: [{ version: '1.0.0', paths }],
    ...extra,
  };
}

export const allowedHigh = () => advisory(1000010, 'high', [PATH_A]);

// pnpm 10 `actions` record: action/resolves/module/target/depth.
export function updateAction(resolved, module = 'example-lib') {
  return {
    action: 'update',
    resolves: resolved.map(entry => ({
      id: entry.id,
      path: entry.findings[0].paths[0],
      dev: false,
      optional: false,
      bundled: false,
    })),
    module,
    target: '1.0.1',
    depth: 3,
  };
}

// Counts one per record; tests involving repeated records set explicit overrides.
function countsFor(advisories, overrides = {}) {
  const counts = { info: 0, low: 0, moderate: 0, high: 0, critical: 0 };
  advisories.forEach(entry => {
    if (entry && entry.severity in counts) counts[entry.severity] += 1;
  });
  return { ...counts, ...overrides };
}

function pnpmReportObject(
  advisories,
  overrides = {},
  { keyed = false, actions = [], muted = [], extra = {}, metadataExtra = {} } = {}
) {
  return {
    actions,
    advisories: keyed
      ? Object.fromEntries(advisories.map(entry => [String(entry.id), entry]))
      : advisories,
    muted,
    metadata: {
      vulnerabilities: countsFor(advisories, overrides),
      dependencies: 1006,
      devDependencies: 0,
      optionalDependencies: 0,
      totalDependencies: 1006,
      ...metadataExtra,
    },
    ...extra,
  };
}

export function pnpmReport(...args) {
  return JSON.stringify(pnpmReportObject(...args), null, 2);
}

export function pnpmReportWithout(key) {
  const report = pnpmReportObject([]);
  delete report[key];
  return JSON.stringify(report);
}

// Shape of the installed pnpm 10.28.2 production report: keyed advisories,
// four update actions, empty muted, 13 moderate + 2 low.
export function realisticPnpm10Report() {
  const advisories = Array.from({ length: 15 }, (_, i) =>
    advisory(1239940 + i, i < 13 ? 'moderate' : 'low', [`apps__web>lib-${i % 4}>dep-${i}`])
  );
  const actions = [0, 1, 2, 3].map(n =>
    updateAction(
      advisories.filter((_, i) => i % 4 === n),
      `lib-${n}`
    )
  );
  return pnpmReport(advisories, {}, { keyed: true, actions });
}

export function streamRecords(advisories, { summary = true, overrides = {} } = {}) {
  const records = advisories.map(entry => ({
    type: 'auditAdvisory',
    data: { resolution: { id: entry.id, path: PATH_A, dev: false }, advisory: entry },
  }));
  if (summary) {
    records.push({
      type: 'auditSummary',
      data: { vulnerabilities: countsFor(advisories, overrides), dependencies: 10 },
    });
  }
  return records;
}

export function ndjson(records) {
  return `${records.map(record => JSON.stringify(record)).join('\n')}\n`;
}

export function encodings(advisories, overrides = {}) {
  return {
    'pnpm object': pnpmReport(advisories, overrides),
    'JSON-array stream': JSON.stringify(streamRecords(advisories, { overrides })),
    NDJSON: ndjson(streamRecords(advisories, { overrides })),
  };
}
