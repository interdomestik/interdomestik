import { describe, expect, it } from 'vitest';

import {
  hasCaseScopedDocumentGrant,
  hasScopedClaimReadAccess,
  isFullTenantClaimsRole,
} from './access-policy';

describe('document access policy', () => {
  it('treats global support as selected-tenant read, not legal-entity mutation', () => {
    expect(isFullTenantClaimsRole('global_support')).toBe(true);
    expect(isFullTenantClaimsRole('auditor')).toBe(false);
  });

  it('allows grants only for the named case and document class inside the access tenant', () => {
    const session = {
      user: {
        id: 'local-legal-1',
        caseScopedAccessGrants: [
          {
            accessTenantId: 'tenant_access',
            actorId: 'local-legal-1',
            caseId: 'claim-1',
            documentClasses: ['legal' as const],
          },
        ],
      },
    };

    expect(
      hasCaseScopedDocumentGrant({
        accessTenantId: 'tenant_access',
        caseId: 'claim-1',
        documentClass: 'legal',
        session,
      })
    ).toBe(true);
    expect(
      hasCaseScopedDocumentGrant({
        accessTenantId: 'tenant_legal',
        caseId: 'claim-1',
        documentClass: 'legal',
        session,
      })
    ).toBe(false);
    expect(
      hasCaseScopedDocumentGrant({
        accessTenantId: 'tenant_access',
        caseId: 'claim-1',
        documentClass: 'medical',
        session,
      })
    ).toBe(false);
  });

  it('does not elevate branch staff to branch-manager document access', () => {
    expect(
      hasScopedClaimReadAccess({
        branchId: 'branch-1',
        claim: { branchId: 'branch-1', staffId: 'staff-2', userId: 'member-1' },
        role: 'staff',
        userId: 'staff-1',
      })
    ).toBe(false);
    expect(
      hasScopedClaimReadAccess({
        branchId: 'branch-1',
        claim: { branchId: 'branch-1', staffId: 'staff-1', userId: 'member-1' },
        role: 'staff',
        userId: 'staff-1',
      })
    ).toBe(true);
  });

  it('preserves assigned staff document access across branch boundaries', () => {
    expect(
      hasScopedClaimReadAccess({
        branchId: 'branch-1',
        claim: { branchId: 'branch-2', staffId: 'staff-1', userId: 'member-1' },
        role: 'staff',
        userId: 'staff-1',
      })
    ).toBe(true);
  });

  it('does not grant branchless staff access to every unassigned claim document', () => {
    expect(
      hasScopedClaimReadAccess({
        branchId: null,
        claim: { branchId: null, staffId: null, userId: 'member-1' },
        role: 'staff',
        userId: 'staff-1',
      })
    ).toBe(false);
  });
});
