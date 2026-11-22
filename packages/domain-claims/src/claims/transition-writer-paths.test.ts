import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { describe, expect, it } from 'vitest';

const repoRoot = fileURLToPath(new URL('../../../../', import.meta.url));

function source(relativePath: string): string {
  return readFileSync(`${repoRoot}/${relativePath}`, 'utf8');
}

describe('T-002b central transition writer paths', () => {
  it.each([
    [
      'admin transaction adapter',
      'packages/domain-claims/src/admin-claims/status-transition.ts',
      'transitionClaimStatusInTransaction',
    ],
    [
      'admin ops action',
      'apps/web/src/features/admin/claims/actions/ops-status-action.ts',
      'changeClaimStatus(',
    ],
    [
      'staff status action',
      'apps/web/src/actions/staff-claims/update-status.core.ts',
      'changeClaimStatus(',
    ],
    [
      'shared status persistence',
      'packages/domain-claims/src/claims/change-status-write.ts',
      'writeAuthorizedTransitionStatus',
    ],
  ] as const)('%s delegates to the central transition runtime', (_label, path, marker) => {
    expect(source(path)).toContain(marker);
  });

  it('exports the shared command and closes the former writer paths', () => {
    const { exports } = JSON.parse(source('packages/domain-claims/package.json'));
    expect(exports['./claims/change-status']).toBe('./src/claims/change-status.ts');
    expect(exports['./claims/transition-guard']).toBe('./src/claims/transition-guard.ts');
    expect(exports['./claims/draft']).toBe('./src/claims/draft.ts');
    for (const subpath of [
      './admin-claims/status-transition',
      './admin-claims/update-status',
      './agent-claims/update-status',
      './claims/status',
      './claims/transition',
      './staff-claims/update-status',
    ]) {
      expect(exports[subpath]).toBeUndefined();
    }

    expect(source('packages/domain-claims/src/index.ts')).not.toMatch(
      /update(?:Admin|Agent|Staff)?ClaimStatusCore|transitionClaimStatus\w*|transitionAdminClaimStatus\w*|writeAuthorizedTransitionStatus|assignStaffClaimCore/
    );
    expect(source('packages/domain-claims/src/claims/draft.ts')).not.toContain('cancelClaimCore');
  });

  it('keeps member submission on member-intake submitted, not airline submission', () => {
    const submitSource = source('packages/domain-claims/src/claims/submit.ts');

    expect(submitSource).toContain('recordSubmittedClaimLifecycle');
    expect(submitSource).not.toContain('submitted_to_airline');
  });

  it('reads transition evidence through the access-tenant RLS visibility predicate', () => {
    const readSource = source('packages/domain-claims/src/claims/transition-evidence-read.ts');

    expect(readSource).toContain('coalesce("access_tenant_id", "tenant_id")');
    expect(readSource).not.toContain('where "tenant_id" = ${params.tenantId}');
  });
});
