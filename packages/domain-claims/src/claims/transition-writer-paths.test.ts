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
      'package status command',
      'packages/domain-claims/src/claims/status.ts',
      'transitionClaimStatus',
    ],
    [
      'legacy package status command',
      'packages/domain-claims/src/update-claim-status.ts',
      'transitionClaimStatusInTransaction',
    ],
    [
      'admin adapter',
      'packages/domain-claims/src/admin-claims/update-status.ts',
      'transitionClaimStatus',
    ],
    [
      'admin transaction adapter',
      'packages/domain-claims/src/admin-claims/status-transition.ts',
      'transitionClaimStatusInTransaction',
    ],
    [
      'agent adapter',
      'packages/domain-claims/src/agent-claims/update-status.ts',
      'transitionClaimStatus',
    ],
    [
      'staff adapter',
      'packages/domain-claims/src/staff-claims/update-status.ts',
      'transitionClaimStatusInTransaction',
    ],
    [
      'member cancellation command',
      'packages/domain-claims/src/claims/draft-cancellation.ts',
      'transitionClaimStatus',
    ],
    [
      'web action adapter',
      'apps/web/src/actions/claims/status.core.ts',
      'updateClaimStatusCoreDomain',
    ],
  ] as const)('%s delegates to the central transition runtime', (_label, path, marker) => {
    expect(source(path)).toContain(marker);
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
