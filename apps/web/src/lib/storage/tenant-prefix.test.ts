import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  assertClaimEvidenceStoragePath,
  assertPolicyStoragePath,
  assertTenantStoragePath,
  buildPolicyStoragePath,
  splitStorageFolderAndName,
} from './tenant-prefix';

describe('tenant-prefixed storage paths', () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it('accepts tenant-prefixed claim evidence and policy paths', () => {
    expect(() =>
      assertClaimEvidenceStoragePath({
        bucket: 'claim-evidence',
        path: 'pii/tenants/tenant-a/claims/claim-1/file.pdf',
        tenantId: 'tenant-a',
      })
    ).not.toThrow();

    expect(() =>
      assertPolicyStoragePath({
        bucket: 'policies',
        path: 'pii/tenants/tenant-a/policies/user-1/file.pdf',
        tenantId: 'tenant-a',
      })
    ).not.toThrow();
  });

  it('rejects legacy, cross-tenant, and sibling-prefix paths', () => {
    const common = {
      bucket: 'claim-evidence',
      family: 'claims' as const,
      tenantId: 'tenant-a',
    };

    expect(() =>
      assertTenantStoragePath({ ...common, path: 'pii/claims/user-1/file.pdf' })
    ).toThrow(/pii\/tenants\/tenant-a\/claims/);

    expect(() =>
      assertTenantStoragePath({
        ...common,
        path: 'pii/tenants/tenant-b/claims/claim-1/file.pdf',
      })
    ).toThrow(/pii\/tenants\/tenant-a\/claims/);

    expect(() =>
      assertTenantStoragePath({
        ...common,
        path: 'pii/tenants/tenant-a-extra/claims/claim-1/file.pdf',
      })
    ).toThrow(/pii\/tenants\/tenant-a\/claims/);
  });

  it('rejects traversal, backslash, and empty-segment paths', () => {
    const common = {
      bucket: 'claim-evidence',
      family: 'claims' as const,
      tenantId: 'tenant-a',
    };

    expect(() =>
      assertTenantStoragePath({
        ...common,
        path: 'pii/tenants/tenant-a/claims/claim-1/../file.pdf',
      })
    ).toThrow(/traversal/);

    expect(() =>
      assertTenantStoragePath({
        ...common,
        path: 'pii/tenants/tenant-a/claims/claim-1\\file.pdf',
      })
    ).toThrow(/backslashes/);

    expect(() =>
      assertTenantStoragePath({
        ...common,
        path: 'pii/tenants//claims/claim-1/file.pdf',
      })
    ).toThrow(/empty segments/);
  });

  it('rejects bucket and family mismatches', () => {
    expect(() =>
      assertTenantStoragePath({
        bucket: 'policies',
        family: 'claims',
        path: 'pii/tenants/tenant-a/claims/claim-1/file.pdf',
        tenantId: 'tenant-a',
      })
    ).toThrow(/bucket mismatch/);

    expect(() =>
      assertTenantStoragePath({
        bucket: 'policies',
        family: 'policies',
        path: 'pii/tenants/tenant-a/claims/claim-1/file.pdf',
        tenantId: 'tenant-a',
      })
    ).toThrow(/pii\/tenants\/tenant-a\/policies/);
  });

  it('accepts configured evidence and policy buckets', () => {
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_EVIDENCE_BUCKET', 'tenant-evidence');
    vi.stubEnv('NEXT_PUBLIC_SUPABASE_POLICY_BUCKET', 'tenant-policies');

    expect(() =>
      assertClaimEvidenceStoragePath({
        bucket: 'tenant-evidence',
        path: 'pii/tenants/tenant-a/claims/claim-1/file.pdf',
        tenantId: 'tenant-a',
      })
    ).not.toThrow();

    expect(() =>
      assertPolicyStoragePath({
        bucket: 'tenant-policies',
        path: 'pii/tenants/tenant-a/policies/user-1/file.pdf',
        tenantId: 'tenant-a',
      })
    ).not.toThrow();

    expect(() =>
      assertPolicyStoragePath({
        bucket: 'policies',
        path: 'pii/tenants/tenant-a/policies/user-1/file.pdf',
        tenantId: 'tenant-a',
      })
    ).toThrow(/tenant-policies/);
  });

  it('builds policy paths through the centralized helper', () => {
    const path = buildPolicyStoragePath({
      fileName: '123_policy.pdf',
      tenantId: 'tenant-a',
      userId: 'user-1',
    });

    expect(path).toBe('pii/tenants/tenant-a/policies/user-1/123_policy.pdf');
    expect(splitStorageFolderAndName(path)).toEqual({
      fileName: '123_policy.pdf',
      folder: 'pii/tenants/tenant-a/policies/user-1',
    });
  });
});
