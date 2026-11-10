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

import { isAdminUploadRole } from './admin-upload-role';

describe('isAdminUploadRole', () => {
  it('admits staff and administrators and denies branch managers', () => {
    for (const role of [ROLE_ADMIN, ROLE_SUPER_ADMIN, ROLE_TENANT_ADMIN, ROLE_STAFF]) {
      expect(isAdminUploadRole(role)).toBe(true);
    }
    for (const role of [
      ROLE_BRANCH_MANAGER,
      ROLE_MEMBER,
      ROLE_AGENT,
      ROLE_PROMOTER,
      ROLE_GLOBAL_SUPPORT,
      ROLE_AUDITOR,
    ]) {
      expect(isAdminUploadRole(role)).toBe(false);
    }
    expect(isAdminUploadRole(null)).toBe(false);
    expect(isAdminUploadRole(undefined)).toBe(false);
  });
});
