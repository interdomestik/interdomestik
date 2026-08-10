import { readFileSync } from 'node:fs';
import { dirname, extname, join, relative, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

const root = resolve(__dirname);
const entries = ['index.tsx', 'main-panel.tsx', 'dormant-preview.tsx', 'use-saved-draft-claim.ts'];
const denied = [
  /from\s+['"][^'"]*claim-wizard|<ClaimWizard\b/i,
  /claims\.core/i,
  /\bsubmitClaim(?:Core)?\b/,
  /\bcreateClaim(?:Core)?\b/,
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
  it('permits only the dedicated saved-draft submit seam in the three-file graph', () => {
    const graph = new Map<string, string>();
    for (const entry of entries) walk(join(root, entry), graph);
    expect([...graph.keys()].map(path => relative(root, path)).sort()).toEqual(entries.sort());
    const combined = [...graph.values()].join('\n');
    for (const pattern of denied) expect(combined).not.toMatch(pattern);
    expect(combined).toContain('use-draft-lifecycle');
    expect(combined).toContain('@/actions/claims/create-from-saved-draft');
    expect(combined.match(/createClaimFromSavedDraft/g)).toHaveLength(2);
    expect(combined.match(/const UUID =/g)).toHaveLength(1);
    expect(graph.get(join(root, 'dormant-preview.tsx'))).toContain('isSavedDraftId(activeDraftId)');
    expect(graph.get(join(root, 'use-saved-draft-claim.ts'))).not.toContain('useCallback');
  });

  it('keeps the route on ClaimDraftIntake and every new file below 150 lines', () => {
    const route = resolve(root, '../../../app/[locale]/(app)/member/claims/new/_core.entry.tsx');
    const routeSource = readFileSync(route, 'utf8');
    expect(routeSource).toContain('@/components/claims/claim-draft-intake');
    expect(routeSource).not.toMatch(/claim-wizard/i);
    for (const name of entries) {
      expect(readFileSync(join(root, name), 'utf8').split('\n').length - 1).toBeLessThan(150);
    }
    const action = resolve(root, '../../../actions/claims/create-from-saved-draft.ts');
    const identity = resolve(root, '../../../actions/claims/saved-draft-claim-identity.ts');
    const submitCore = resolve(root, '../../../actions/claims/submit.core.ts');
    const domainSubmit = resolve(
      root,
      '../../../../../../packages/domain-claims/src/claims/submit.ts'
    );
    expect(readFileSync(action, 'utf8').split('\n').length - 1).toBeLessThan(150);
    expect(readFileSync(identity, 'utf8').split('\n').length - 1).toBeLessThan(150);
    expect(readFileSync(submitCore, 'utf8').split('\n').length - 1).toBeLessThanOrEqual(150);
    expect(readFileSync(domainSubmit, 'utf8').split('\n').length - 1).toBeLessThanOrEqual(478);
  });

  it('keeps ineligible submit disabled and binds only the dedicated eligible handler', () => {
    const preview = readFileSync(join(root, 'dormant-preview.tsx'), 'utf8');
    expect(preview).toMatch(/<button[\s\S]*?disabled[\s\S]*?>/);
    expect(preview).toContain('onClick={submit}');
    expect(preview).not.toMatch(/<form|onSubmit|formAction|type=["']submit/);
    const mainPanel = readFileSync(join(root, 'main-panel.tsx'), 'utf8');
    expect(mainPanel).toMatch(/key=.*activeDraftId.*activeDraftVersion/);
    expect(mainPanel).toContain('managerOnly={props.managerOnly}');
    const index = readFileSync(join(root, 'index.tsx'), 'utf8');
    expect(index).toContain("flow.step !== 'preview' && flow.step !== 'complete'");
    expect(index).not.toContain('lifecycle.active?.id && /^[0-9a-f]');
    const identity = readFileSync(
      resolve(root, '../../../actions/claims/saved-draft-claim-identity.ts'),
      'utf8'
    );
    expect(identity).toContain("import 'server-only'");
    expect(identity).toContain(
      'db-access-guard: tenant-scoped -- reason: RLS enabled, not enforced for this runtime role; exact-id, tenant and owner'
    );
    expect(identity).not.toMatch(
      /createClaimCore|generateClaimNumber|adminDb|provider|upload|storage|notification/i
    );
  });

  it('keeps the required E2E scenario executable in exactly one residue-producing project', () => {
    const spec = resolve(root, '../../../../e2e/gate/member-claim-draft-intake.spec.ts');
    const source = readFileSync(spec, 'utf8');
    expect(source).not.toMatch(/test\.(skip|fixme)\(\s*\)|test\.describe\.skip|test\.fixme\b/);
    expect(source).toContain("test.skip(testInfo.project.name !== 'gate-ks-sq'");
    expect(source).toContain('resolveIdaTarget');
    expect(source).toContain("name: 'cookie_consent'");
    expect(source).not.toContain('dismissCookieConsent');
  });
});
