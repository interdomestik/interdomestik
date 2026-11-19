// Evaluation of one invocation (design §7): which checks run, the ratchet per check, the
// predicate digest (r9 B22) and the one exit rule.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ScanError, sha256 } from './ast.mjs';
import { coverageShortfall, ratchet, tamperFindings } from './baseline.mjs';
import { CHK04 } from './chk04.mjs';
import { CHK05 } from './chk05.mjs';
import { CHK05B } from './chk05b.mjs';
import { CHK26 } from './chk26.mjs';
import { UNAUTH_TEXT } from './unauth-text.mjs';

export const CHECKS = Object.freeze([CHK04, CHK05, CHK05B, CHK26, UNAUTH_TEXT]);
const HERE = path.dirname(fileURLToPath(import.meta.url));

// sha256 over the check's predicate sources (this scanner's own files) and its baseline settings.
export function predicateDigest(check, settings, dir = HERE) {
  const parts = check.sources.map(
    name => `${name}\n${fs.readFileSync(path.join(dir, name), 'utf8')}`
  );
  const config = JSON.stringify({
    unit: settings.unit,
    predicate: settings.predicate,
    coverageMin: settings.coverageMin,
  });
  return sha256(`${parts.join('\n\u0000\n')}\n\u0000\n${config}`);
}

const isFail = (baseline, id) => baseline?.checks?.[id]?.mode === 'fail';

// The checks this invocation evaluates: one (`--check`), the enforcing ones, or all.
export function selectChecks({ check, enforcing }, base, head) {
  if (check) {
    const hit = CHECKS.find(candidate => candidate.id === check);
    if (!hit) throw new ScanError(`unknown check ${check}`);
    return [hit];
  }
  if (enforcing)
    return CHECKS.filter(candidate => isFail(base, candidate.id) || isFail(head, candidate.id));
  return [...CHECKS];
}

export function evaluateCheck(check, ctx, base, head, shas) {
  const settings = head.checks[check.id];
  const enforcing = isFail(base, check.id) || isFail(head, check.id);
  const tamper = tamperFindings(check.id, base, head);
  if (!settings) {
    return {
      id: check.id,
      ...shas,
      digest: null,
      enforcing,
      units: 0,
      total: 0,
      new: [],
      fixed: [],
      tamper,
      findings: [],
    };
  }
  const result = check.run(ctx);
  const shortfall = coverageShortfall(result.units, settings.coverageMin);
  if (shortfall.length)
    throw new ScanError(`${check.id} coverage below minimum (${shortfall.join(', ')})`);
  const plain = result.findings.filter(f => !f.ambiguous).map(f => f.id);
  const ambiguous = result.findings.filter(f => f.ambiguous).map(f => f.id);
  const { new: added, fixed } = ratchet(plain, settings.items);
  return {
    id: check.id,
    ...shas,
    digest: predicateDigest(check, settings),
    mode: { base: base?.checks?.[check.id]?.mode ?? null, head: settings.mode },
    enforcing,
    units: result.units,
    total: result.findings.length,
    new: [...added, ...ambiguous],
    fixed,
    tamper,
    reportOnly: result.reportOnly ?? [],
    findings: result.findings,
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
