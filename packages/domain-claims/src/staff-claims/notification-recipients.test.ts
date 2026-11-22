import type { TenantTransaction } from '@interdomestik/database';
import { PgDialect } from 'drizzle-orm/pg-core';
import { describe, expect, it, vi } from 'vitest';
import { resolveStaffClaimNotificationRecipients } from './notification-recipients';

const claim = { tenantId: 'tenant', claimId: 'claim', staffId: 'assignee' };
const staff = (id: string, branchId: string | null = null) => ({
  id,
  role: 'staff',
  branchId,
  emailVerified: true,
});
const admin = { ...staff('tenant-admin'), role: 'tenant_admin' };
const candidates = [
  staff('assignee'),
  staff('same-branch', 'a'),
  staff('outside-branch', 'b'),
  admin,
];

function txWithCandidates(admitted: boolean[] = []) {
  const lock = vi.fn().mockResolvedValue(candidates);
  const where = vi.fn().mockImplementation(() => {
    const rows = Promise.resolve(admitted.shift() ? [{ id: claim.claimId }] : []);
    return Object.assign(rows, { orderBy: () => ({ for: lock }) });
  });
  const select = vi.fn().mockReturnValue({ from: () => ({ where }) });
  return { tx: { select } as unknown as TenantTransaction, where, lock };
}

describe('staff claim notification routing', () => {
  it('locks and checks every staff candidate, then routes only to the admitted assignee', async () => {
    const h = txWithCandidates([false, true, true, false]);
    await expect(resolveStaffClaimNotificationRecipients(h.tx, claim)).resolves.toEqual([
      candidates[0],
    ]);
    expect(h.lock).toHaveBeenCalledExactlyOnceWith('share');
    const dialect = new PgDialect();
    expect(h.where.mock.calls.slice(1).map(([scope]) => dialect.sqlToQuery(scope).params)).toEqual([
      ['tenant', 'claim', 'draft', 'assignee'],
      ['tenant', 'claim', 'draft', 'a'],
      ['tenant', 'claim', 'draft', 'b'],
    ]);
  });

  it('excludes the assignee out of scope and admits only the other staff in scope', async () => {
    const h = txWithCandidates([false, false, true, false]);
    await expect(resolveStaffClaimNotificationRecipients(h.tx, claim)).resolves.toEqual([
      candidates[1],
    ]);
  });

  it('falls back to tenant administrators only when no staff member is admitted', async () => {
    const h = txWithCandidates();
    await expect(resolveStaffClaimNotificationRecipients(h.tx, claim)).resolves.toEqual([admin]);
  });
});
