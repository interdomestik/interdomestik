// Evaluation of one screen-contract invocation (WP-05 design §3, §4): the checks, the evaluator
// digest, the ratchet per check over WP-02's baseline functions, and the exit rule.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';

import { ScanError, byCodeUnit, sha256 } from '../server-mutation/ast.mjs';
import { coverageShortfall, ratchet, tamperFindings } from '../server-mutation/baseline.mjs';
import { SCANNER_ROOT } from './lint.mjs';
import { applyRebuilt } from './transfer.mjs';

export const BASELINE_PATH = 'scripts/ci/screen-contract-baseline.json';
export const SCRIPT_PATH = 'scripts/ci/screen-contract-check.mjs';

// `multiset`: an item can occur more than once in a file (design §2, "Multiplicity").
export const CHECKS = Object.freeze([
  Object.freeze({ id: 'CHK-15c', multiset: true }),
  Object.freeze({ id: 'CHK-15b', multiset: true }),
  Object.freeze({ id: 'CHK-15a', multiset: false }),
  Object.freeze({ id: 'CHK-09', multiset: true }),
  Object.freeze({ id: 'CHK-22', multiset: false }),
  Object.freeze({ id: 'A11Y', multiset: true }),
]);

// Every file that can change a verdict (H2, H5), repo-relative to the scanner's checkout.
export function evaluatorFiles(root = SCANNER_ROOT) {
  const listed = dir =>
    fs
      .readdirSync(path.join(root, dir))
      .filter(name => name.endsWith('.mjs'))
      .map(name => `${dir}/${name}`);
  return [
    'apps/web/eslint.screen-contract.config.mjs',
    ...listed('apps/web/eslint/screen-contract'),
    SCRIPT_PATH,
    ...listed('scripts/ci/screen-contract'),
    'scripts/ci/server-mutation/ast.mjs',
    'scripts/ci/server-mutation/baseline.mjs',
    'scripts/ci/server-mutation/git.mjs',
    'scripts/ci/server-mutation/output.mjs',
  ].sort(byCodeUnit);
}

const VERSIONED = ['eslint', 'typescript-eslint', 'eslint-plugin-jsx-a11y', 'typescript'];

export function toolVersions(root = SCANNER_ROOT) {
  const web = createRequire(path.join(root, 'apps/web/package.json'));
  const top = createRequire(path.join(root, 'package.json'));
  const out = { node: process.version };
  for (const name of VERSIONED) out[name] = web(`${name}/package.json`).version;
  out['enhanced-resolve'] = top('enhanced-resolve/package.json').version;
  return out;
}

const canonical = value =>
  value !== null && typeof value === 'object' && !Array.isArray(value)
    ? Object.fromEntries(Object.entries(value).sort(([a], [b]) => byCodeUnit(a, b)))
    : value;

// sha256 over the evaluator's files, the check's baseline settings and the tool versions.
export function evaluatorDigest(settings, root = SCANNER_ROOT, versions = toolVersions()) {
  const parts = evaluatorFiles(root).map(
    rel => `${rel}\n${fs.readFileSync(path.join(root, rel), 'utf8')}`
  );
  const config = JSON.stringify({
    unit: settings?.unit ?? null,
    predicate: settings?.predicate ?? null,
    coverageMin: canonical(settings?.coverageMin ?? null),
    versions: canonical(versions),
  });
  return sha256(`${parts.join('\n\u0000\n')}\n\u0000\n${config}`);
}

const isFail = (baseline, id) => baseline?.checks?.[id]?.mode === 'fail';

export function selectChecks({ check, enforcing }, base, head) {
  if (check) {
    const hit = CHECKS.find(candidate => candidate.id === check);
    if (!hit) throw new ScanError(`unknown check ${check}`);
    return [hit];
  }
  if (enforcing) return CHECKS.filter(c => isFail(base, c.id) || isFail(head, c.id));
  return [...CHECKS];
}

const unique = items => [...new Set(items)];

// One check's result. `scan` is the lint output of the check; `extra` carries the findings and
// tamper that come from outside the lint (registry, transfers, rebuilt list).
export function evaluateCheck(check, scan, { base, head, pairedHead, shas, rebuilt, extra }) {
  const settings = head.checks[check.id];
  const enforcing = isFail(base, check.id) || isFail(head, check.id);
  const tamper = [...tamperFindings(check.id, base, pairedHead), ...(extra.tamper ?? [])];
  const empty = { id: check.id, ...shas, digest: null, enforcing, units: {}, total: 0 };
  if (!settings) return { ...empty, new: [], fixed: [], tamper, findings: [] };
  const shortfall = coverageShortfall(scan.units, settings.coverageMin);
  if (shortfall.length)
    throw new ScanError(`${check.id} coverage below minimum (${shortfall.join(', ')})`);
  const findings = [...scan.items, ...(extra.findings ?? [])];
  const current = findings.map(f => f.id);
  const plain = check.multiset ? current : unique(current);
  const { admitted, findings: rebuiltFindings } = applyRebuilt(check.id, settings.items, rebuilt);
  const { new: added, fixed } = ratchet(plain, admitted);
  return {
    id: check.id,
    ...shas,
    digest: evaluatorDigest(settings),
    mode: { base: base?.checks?.[check.id]?.mode ?? null, head: settings.mode },
    enforcing,
    units: scan.units,
    files: scan.files,
    total: plain.length,
    new: added,
    fixed,
    tamper: [...tamper, ...rebuiltFindings],
    findings,
  };
}

// 2 on any error; 1 when an enforcing check has new, fixed or tamper findings; else 0.
export function exitCode(results, errors) {
  if (errors.length) return 2;
  const blocking = results.some(
    r => r.enforcing && (r.new.length || r.fixed.length || r.tamper.length)
  );
  return blocking ? 1 : 0;
}
