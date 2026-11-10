import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';

import {
  buildAccessibleClaimIdsSubquery,
  hasScopedClaimsReadAccess,
  hasScopedStaffClaimAccess,
} from './access';

const claim = (caseLifecycleState: string, staffId: string | null = null) => ({
  branchId: 'branch-1',
  caseLifecycleState,
  staffId,
  userId: 'member-1',
});

describe('scoped staff message access excludes member drafts', () => {
  it.each([
    ['branchless staff', null],
    ['branch staff', 'branch-1'],
  ])('denies a draft to %s and admits the claim once submitted', (_label, branchId) => {
    expect(hasScopedStaffClaimAccess({ branchId, claim: claim('draft'), userId: 'staff-1' })).toBe(
      false
    );
    expect(
      hasScopedStaffClaimAccess({ branchId, claim: claim('submitted'), userId: 'staff-1' })
    ).toBe(true);
    expect(
      hasScopedClaimsReadAccess({
        branchId,
        claim: claim('draft'),
        role: 'staff',
        userId: 'staff-1',
      })
    ).toBe(false);
  });

  it('fails closed when the lifecycle is missing', () => {
    const unknown = { ...claim('submitted'), caseLifecycleState: null };
    expect(hasScopedStaffClaimAccess({ branchId: null, claim: unknown, userId: 'staff-1' })).toBe(
      false
    );
  });

  it('keeps the assignment rule for branchless staff on submitted claims', () => {
    const assigned = claim('submitted', 'staff-2');
    expect(hasScopedStaffClaimAccess({ branchId: null, claim: assigned, userId: 'staff-1' })).toBe(
      false
    );
    expect(hasScopedStaffClaimAccess({ branchId: null, claim: assigned, userId: 'staff-2' })).toBe(
      true
    );
  });

  it('filters drafts out of the staff accessible-claims subquery', () => {
    const rendered: string[] = [];
    const params: unknown[] = [];
    const tx = {
      select: () => ({
        from: () => ({
          where: (condition: Parameters<PgDialect['sqlToQuery']>[0]) => {
            const query = new PgDialect().sqlToQuery(condition);
            rendered.push(query.sql);
            params.push(...query.params);
            return { condition };
          },
        }),
      }),
    };
    for (const branchId of [null, 'branch-1']) {
      buildAccessibleClaimIdsSubquery({
        branchId,
        role: 'staff',
        tenantId: 'tenant-1',
        userId: 'staff-1',
        tx: tx as never,
      });
    }
    expect(rendered).toHaveLength(2);
    for (const sql of rendered) expect(sql).toMatch(/"case_lifecycle_state" <> \$\d+/);
    expect(params.filter(value => value === 'draft')).toHaveLength(2);
  });

  it.each(['auditor', 'unknown', 'branch_manager', null, undefined])(
    'makes the denied %s subquery unsatisfiable, including for a claim named __forbidden__',
    role => {
      const where = vi.fn();
      buildAccessibleClaimIdsSubquery({
        role,
        tenantId: 'tenant-1',
        userId: 'owner-1',
        tx: { select: () => ({ from: () => ({ where }) }) } as never,
      });
      const query = new PgDialect().sqlToQuery(where.mock.calls[0][0]);
      expect(query.sql).toMatch(/"id" <> .*"id"/);
      expect(query.params).toEqual(['tenant-1']);
    }
  );
});
