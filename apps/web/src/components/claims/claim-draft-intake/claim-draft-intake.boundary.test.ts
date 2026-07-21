import { readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname);
const entries = ['index.tsx', 'main-panel.tsx', 'dormant-preview.tsx'];
const denied = [
  /from\s+['"][^'"]*claim-wizard|<ClaimWizard\b/i,
  /claims\.core/i,
  /submitClaim/,
  /createClaim/,
  /updateDraftClaim/,
  /submitFreeStartIntake/,
  /useOrganizerSubmit/,
  /from ['"][^'"]*provider|provider(?:Call|Client|Action)/i,
  /upload/i,
  /\bai[-_/]/i,
  /notification/i,
  /billing/i,
  /callback/i,
  /localStorage|sessionStorage/,
];

function resolveLocal(from: string, specifier: string) {
  const base = resolve(dirname(from), specifier);
  for (const candidate of [base, `${base}.ts`, `${base}.tsx`, join(base, 'index.tsx')]) {
    if (extname(candidate) && candidate.startsWith(root)) {
      try {
        readFileSync(candidate);
        return candidate;
      } catch {
        // Try the next supported local module shape.
      }
    }
  }
  return null;
}

function walk(path: string, seen = new Map<string, string>()) {
  if (seen.has(path)) return seen;
  const source = readFileSync(path, 'utf8');
  seen.set(path, source);
  const imports = source.matchAll(/(?:import|export)\s+(?:[^'";]+?\s+from\s+)?['"]([^'"]+)['"]/g);
  for (const match of imports) {
    if (!match[1]?.startsWith('.')) continue;
    const next = resolveLocal(path, match[1]);
    if (next) walk(next, seen);
  }
  return seen;
}

describe('Claim Draft Intake import and scope boundary', () => {
  it('walks the new local graph and rejects every submission or side-effect seam', () => {
    const graph = new Map<string, string>();
    for (const entry of entries) walk(join(root, entry), graph);
    expect([...graph.keys()].map(path => relative(root, path)).sort()).toEqual(entries.sort());
    const combined = [...graph.values()].join('\n');
    for (const pattern of denied) expect(combined).not.toMatch(pattern);
    expect(combined).toContain('use-draft-lifecycle');
  });

  it('keeps the route on ClaimDraftIntake and every new file below 150 lines', () => {
    const route = resolve(root, '../../../app/[locale]/(app)/member/claims/new/_core.entry.tsx');
    const routeSource = readFileSync(route, 'utf8');
    expect(routeSource).toContain('@/components/claims/claim-draft-intake');
    expect(routeSource).not.toMatch(/claim-wizard/i);
    for (const name of [
      ...entries,
      'claim-draft-intake.test.tsx',
      'claim-draft-intake.boundary.test.ts',
    ]) {
      expect(readFileSync(join(root, name), 'utf8').split('\n').length - 1).toBeLessThan(150);
    }
  });

  it('keeps dormant submit statically disabled with no handler or form fallback', () => {
    const preview = readFileSync(join(root, 'dormant-preview.tsx'), 'utf8');
    expect(preview).toMatch(/<button[\s\S]*?disabled[\s\S]*?>/);
    expect(preview).not.toMatch(/<form|onSubmit|onClick|formAction|type=["']submit/);
  });

  it('keeps the required E2E scenario executable instead of self-skipping', () => {
    const spec = resolve(root, '../../../../e2e/gate/member-claim-draft-intake.spec.ts');
    const source = readFileSync(spec, 'utf8');
    expect(source).not.toMatch(/test\.skip|test\.fixme/);
    expect(source).toContain('resolveIdaTarget');
  });
});
