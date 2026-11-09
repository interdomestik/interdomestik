import { ALBANIAN_NAMES, MACEDONIAN_NAMES, TENANTS, WORKLOAD_PREFIX } from './constants';

export type WorkloadUserFixture = Readonly<{
  id: string;
  name: string;
  email: string;
  role: string;
  tenantId: string;
  branchId: string | null;
}>;

/** Shared exact ownership tuples for workload seeding and repeat-run cleanup. */
export function buildWorkloadUsers(): readonly WorkloadUserFixture[] {
  const users: WorkloadUserFixture[] = [];
  const addUser = (
    id: string,
    name: string,
    email: string,
    role: string,
    tenantId: string,
    branchId?: string
  ) => {
    users.push({ id, name, email, role, tenantId, branchId: branchId ?? null });
  };
  // KS: 1 Manager, 2 agents, 2 staff, 30 members
  addUser(
    `${WORKLOAD_PREFIX}ks_mgr`,
    'Valmir Shala',
    'mgr.ks.work@example.com',
    'branch_manager',
    TENANTS.KS,
    `${WORKLOAD_PREFIX}ks_branch_1`
  );
  addUser(
    `${WORKLOAD_PREFIX}ks_agent_1`,
    'Luan Berisha',
    'agent.ks.work1@example.com',
    'agent',
    TENANTS.KS,
    `${WORKLOAD_PREFIX}ks_branch_1`
  );
  addUser(
    `${WORKLOAD_PREFIX}ks_agent_2`,
    'Arbenita Krasniqi',
    'agent.ks.work2@example.com',
    'agent',
    TENANTS.KS,
    `${WORKLOAD_PREFIX}ks_branch_2`
  );
  addUser(
    `${WORKLOAD_PREFIX}ks_staff_1`,
    'Besnik Gashi',
    'staff.ks.work1@example.com',
    'staff',
    TENANTS.KS
  );
  addUser(
    `${WORKLOAD_PREFIX}ks_staff_2`,
    'Drita Morina',
    'staff.ks.work2@example.com',
    'staff',
    TENANTS.KS
  );

  for (let i = 0; i < 30; i++) {
    const name = ALBANIAN_NAMES[i % ALBANIAN_NAMES.length] + ` ${i + 1}`;
    const branchId = `${WORKLOAD_PREFIX}ks_branch_${(i % 3) + 1}`;
    addUser(
      `${WORKLOAD_PREFIX}ks_member_${i + 1}`,
      name,
      `member.ks.work${i + 1}@example.com`,
      'member',
      TENANTS.KS,
      branchId
    );
  }

  // MK: 1 Manager, 2 agents, 1 staff, 20 members
  addUser(
    `${WORKLOAD_PREFIX}mk_mgr`,
    'Zoran Jovanovski',
    'mgr.mk.work@example.com',
    'branch_manager',
    TENANTS.MK,
    `${WORKLOAD_PREFIX}mk_branch_1`
  );
  addUser(
    `${WORKLOAD_PREFIX}mk_agent_1`,
    'Elena Petrovska',
    'agent.mk.work1@example.com',
    'agent',
    TENANTS.MK,
    `${WORKLOAD_PREFIX}mk_branch_1`
  );
  addUser(
    `${WORKLOAD_PREFIX}mk_agent_2`,
    'Igor Naumovski',
    'agent.mk.work2@example.com',
    'agent',
    TENANTS.MK,
    `${WORKLOAD_PREFIX}mk_branch_2`
  );
  addUser(
    `${WORKLOAD_PREFIX}mk_staff_1`,
    'Maja Stojanovska',
    'staff.mk.work1@example.com',
    'staff',
    TENANTS.MK
  );

  for (let i = 0; i < 20; i++) {
    const name = MACEDONIAN_NAMES[i % MACEDONIAN_NAMES.length] + ` ${i + 1}`;
    const branchId = `${WORKLOAD_PREFIX}mk_branch_${(i % 2) + 1}`;
    addUser(
      `${WORKLOAD_PREFIX}mk_member_${i + 1}`,
      name,
      `member.mk.work${i + 1}@example.com`,
      'member',
      TENANTS.MK,
      branchId
    );
  }

  return users;
}
