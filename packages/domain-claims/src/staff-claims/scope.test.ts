import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it } from 'vitest';

import { buildScopedStaffClaimWhere, buildStaffClaimReadScope } from './scope';

const dialect = new PgDialect();
const render = (where: ReturnType<typeof buildStaffClaimReadScope>) => {
  if (!where) throw new Error('expected a staff scope predicate');
  return dialect.sqlToQuery(where);
};

describe('staff claim scope', () => {
  it.each([
    ['branchless staff', null],
    ['branch-scoped staff', 'ks_branch_a'],
  ])('denies a member draft to %s', (_label, branchId) => {
    const { sql, params } = render(
      buildStaffClaimReadScope({ branchId, claimId: 'claim_1', userId: 'staff_1' })
    );
    expect(sql).toMatch(/not case[\s\S]+'draft'[\s\S]+end in \(\$\d+\)/i);
    expect(params).toContain('draft');
    expect(params).toContain('claim_1');
  });

  it('keeps the assignment rule for branchless staff and the branch rule for branch staff', () => {
    const branchless = render(
      buildStaffClaimReadScope({ branchId: null, claimId: 'claim_1', userId: 'staff_1' })
    );
    expect(branchless.sql).toMatch(/"staffId" = \$\d+ or .*"staffId" is null/i);
    expect(branchless.params).toContain('staff_1');

    const branch = render(
      buildStaffClaimReadScope({ branchId: 'ks_branch_a', claimId: 'claim_1', userId: 'staff_1' })
    );
    expect(branch.sql).toMatch(/"branch_id" = \$\d+/);
    expect(branch.sql).not.toMatch(/"staffId"/);
    expect(branch.params).toContain('ks_branch_a');
  });

  it('applies the draft exclusion inside the tenant-scoped predicate every staff write uses', () => {
    const where = buildScopedStaffClaimWhere({
      branchId: null,
      claimId: 'claim_1',
      tenantId: 'tenant_ks',
      userId: 'staff_1',
    });
    const { sql, params } = render(where);
    expect(params).toEqual(expect.arrayContaining(['tenant_ks', 'claim_1', 'draft', 'staff_1']));
    expect(sql).toMatch(/"tenant_id" = \$\d+/);
  });
});
