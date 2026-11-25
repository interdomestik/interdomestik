import { E2E_USERS } from '../e2e-users';
import { goldenId } from '../seed-utils/seed-ids';
import { TENANTS } from './constants';
import type { SeedGoldenContext } from './types';

export const UNACCEPTED_MEMBER_ID = goldenId('mk_member_unaccepted');

export function buildMkMemberFixtures({ at }: Pick<SeedGoldenContext, 'at'>) {
  return [
    {
      id: UNACCEPTED_MEMBER_ID,
      name: 'Acceptance Fixture',
      email: 'unaccepted.member@example.test',
      role: 'member',
      tenantId: TENANTS.MK,
      branchId: E2E_USERS.MK_MEMBER.branchId,
    },
    {
      id: goldenId('mk_member_1'),
      name: E2E_USERS.MK_MEMBER.name,
      email: E2E_USERS.MK_MEMBER.email,
      role: 'member',
      tenantId: TENANTS.MK,
      branchId: E2E_USERS.MK_MEMBER.branchId,
      memberNumber: 'MEM-2026-000001',
      memberNumberIssuedAt: at(),
    },
  ];
}
