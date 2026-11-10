import {
  ROLE_ADMIN,
  ROLE_AGENT,
  ROLE_AUDITOR,
  ROLE_BRANCH_MANAGER,
  ROLE_GLOBAL_SUPPORT,
  ROLE_MEMBER,
  ROLE_PROMOTER,
  ROLE_STAFF,
  ROLE_SUPER_ADMIN,
  ROLE_TENANT_ADMIN,
} from '@/lib/roles.core';
import { describe, expect, it } from 'vitest';
import { deniesClaimDocumentContent } from './branch-manager-document-boundary';

describe('D1 branch manager document boundary', () => {
  it('denies the exact branch manager role, including former uploaders and claim owners', () => {
    expect(deniesClaimDocumentContent(ROLE_BRANCH_MANAGER)).toBe(true);
  });

  it.each([
    ROLE_ADMIN,
    ROLE_TENANT_ADMIN,
    ROLE_SUPER_ADMIN,
    ROLE_STAFF,
    ROLE_AGENT,
    ROLE_MEMBER,
    ROLE_PROMOTER,
    ROLE_GLOBAL_SUPPORT,
    ROLE_AUDITOR,
    null,
    undefined,
    'unknown',
  ])('leaves %s to the existing authorization policy', role => {
    expect(deniesClaimDocumentContent(role)).toBe(false);
  });
});
