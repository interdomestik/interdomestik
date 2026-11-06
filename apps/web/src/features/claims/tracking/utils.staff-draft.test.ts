import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildClaimVisibilityWhere } from './utils';

const render = (role: string, branchId: string | null) =>
  new PgDialect().sqlToQuery(
    buildClaimVisibilityWhere({ tenantId: 'tenant-1', userId: 'staff-1', role, branchId })
  );

describe('claim visibility for staff excludes member drafts', () => {
  it.each([null, 'branch-1'])('staff with branch %s cannot see a draft', branchId => {
    const { sql, params } = render('staff', branchId);
    expect(sql).toMatch(/"case_lifecycle_state" <> \$\d+/);
    expect(params).toContain('draft');
  });

  it('leaves full-tenant admin visibility unchanged', () => {
    const { sql } = render('admin', null);
    expect(sql).not.toMatch(/case_lifecycle_state/);
  });
});
