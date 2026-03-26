import { describe, expect, it } from 'vitest';
import { toClientShellUser } from './client-shell-user';

describe('toClientShellUser', () => {
  it('picks only the primitive fields needed by authenticated shell widgets', () => {
    const result = toClientShellUser({
      id: 'staff-1',
      name: 'Drita Gashi',
      email: 'staff.ks@interdomestik.com',
      image: null,
      role: 'staff',
      tenantId: 'tenant-ks',
      branchId: 'branch-1',
      createdAt: new Date('2026-03-26T00:00:00.000Z'),
      updatedAt: new Date('2026-03-26T00:00:00.000Z'),
    });

    expect(result).toEqual({
      id: 'staff-1',
      name: 'Drita Gashi',
      email: 'staff.ks@interdomestik.com',
      image: null,
      role: 'staff',
    });
  });
});
