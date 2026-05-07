import { E2E_PASSWORD, E2E_USERS } from '../e2e-users';
import { hashPassword } from '../seed-utils/hash-password';
import { goldenId } from '../seed-utils/seed-ids';
import { TENANTS } from './constants';
import type { SeedGoldenContext } from './types';

const pilotMembers = [
  ['01', 'Arta Krasniqi'],
  ['02', 'Blerina Gashi'],
  ['03', 'Donika Berisha'],
  ['04', 'Elira Hoxha'],
  ['05', 'Mimoza Shala'],
  ['06', 'Altin Kelmendi'],
  ['07', 'Besnik Rexhepi'],
  ['08', 'Driton Ahmeti'],
  ['09', 'Fisnik Bytyqi'],
  ['10', 'Luan Morina'],
] as const;

export function buildUsersToSeed({ at }: Pick<SeedGoldenContext, 'at'>) {
  return [
    {
      id: goldenId('super_admin'),
      name: E2E_USERS.SUPER_ADMIN.name,
      email: E2E_USERS.SUPER_ADMIN.email,
      role: E2E_USERS.SUPER_ADMIN.dbRole,
      tenantId: TENANTS.MK,
    },
    {
      id: goldenId('mk_admin'),
      name: E2E_USERS.MK_ADMIN.name,
      email: E2E_USERS.MK_ADMIN.email,
      role: E2E_USERS.MK_ADMIN.dbRole,
      tenantId: TENANTS.MK,
    },
    {
      id: goldenId('mk_staff'),
      name: E2E_USERS.MK_STAFF.name,
      email: E2E_USERS.MK_STAFF.email,
      role: E2E_USERS.MK_STAFF.dbRole,
      tenantId: TENANTS.MK,
      branchId: E2E_USERS.MK_STAFF.branchId,
    },
    {
      id: goldenId('mk_staff_2'),
      name: 'Aneta Nikolovska',
      email: 'staff.mk.2@interdomestik.com',
      role: 'staff',
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
    },
    {
      id: goldenId('pilot_mk_admin'),
      name: E2E_USERS.PILOT_MK_ADMIN.name,
      email: E2E_USERS.PILOT_MK_ADMIN.email,
      role: E2E_USERS.PILOT_MK_ADMIN.dbRole,
      tenantId: TENANTS.PILOT,
    },
    {
      id: goldenId('pilot_mk_agent'),
      name: 'Eset Hoxha',
      email: E2E_USERS.PILOT_MK_AGENT.email,
      role: E2E_USERS.PILOT_MK_AGENT.dbRole,
      tenantId: TENANTS.PILOT,
      branchId: 'pilot_branch_prishtina_central',
    },
    {
      id: goldenId('pilot_mk_agent_2'),
      name: 'Bekim Hoxha',
      email: 'agent.pilot.2@interdomestik.com',
      role: 'agent',
      tenantId: TENANTS.PILOT,
      branchId: 'pilot_branch_prishtina_central',
    },
    {
      id: goldenId('pilot_mk_staff'),
      name: 'Gazmend Abazi',
      email: E2E_USERS.PILOT_MK_STAFF.email,
      role: E2E_USERS.PILOT_MK_STAFF.dbRole,
      tenantId: TENANTS.PILOT,
      branchId: 'pilot_branch_prishtina_central',
    },
    ...pilotMembers.map(([suffix, name]) => ({
      id: goldenId(`pilot_prishtina_member_${suffix}`),
      name,
      email: `member.pilot.prishtina.${suffix}@interdomestik.com`,
      role: 'member' as const,
      tenantId: TENANTS.PILOT,
      branchId: 'pilot_branch_prishtina_central',
      memberNumber: `PILOT-PR-0000${suffix}`,
      memberNumberIssuedAt: at(),
    })),
    {
      id: goldenId('mk_bm_a'),
      name: E2E_USERS.MK_BRANCH_MANAGER.name,
      email: E2E_USERS.MK_BRANCH_MANAGER.email,
      role: E2E_USERS.MK_BRANCH_MANAGER.dbRole,
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
    },
    {
      id: goldenId('mk_agent_a1'),
      name: E2E_USERS.MK_AGENT.name,
      email: E2E_USERS.MK_AGENT.email,
      role: E2E_USERS.MK_AGENT.dbRole,
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
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
    {
      id: goldenId('ks_admin'),
      name: E2E_USERS.KS_ADMIN.name,
      email: E2E_USERS.KS_ADMIN.email,
      role: E2E_USERS.KS_ADMIN.dbRole,
      tenantId: TENANTS.KS,
    },
    {
      id: goldenId('ks_staff'),
      name: E2E_USERS.KS_STAFF.name,
      email: E2E_USERS.KS_STAFF.email,
      role: E2E_USERS.KS_STAFF.dbRole,
      tenantId: TENANTS.KS,
      branchId: E2E_USERS.KS_STAFF.branchId,
    },
    {
      id: goldenId('ks_staff_2'),
      name: 'Besian Mustafa',
      email: 'staff.ks.2@interdomestik.com',
      role: 'staff',
      tenantId: TENANTS.KS,
    },
    {
      id: goldenId('ks_bm_a'),
      name: E2E_USERS.KS_BRANCH_MANAGER.name,
      email: E2E_USERS.KS_BRANCH_MANAGER.email,
      role: E2E_USERS.KS_BRANCH_MANAGER.dbRole,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
    },
    {
      id: goldenId('ks_agent_a1'),
      name: E2E_USERS.KS_AGENT.name,
      email: E2E_USERS.KS_AGENT.email,
      role: E2E_USERS.KS_AGENT.dbRole,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
    },
    {
      id: goldenId('ks_b_agent_1'),
      name: 'Valmir Shala',
      email: 'agent.ks.b1@interdomestik.com',
      role: 'agent',
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_b',
    },
    {
      id: goldenId('ks_c_agent_1'),
      name: 'Luan Berisha',
      email: 'agent.ks.c1@interdomestik.com',
      role: 'agent',
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_c',
    },
    ...Array.from({ length: 6 }).map((_, i) => ({
      id: goldenId(`ks_a_member_${i + 1}`),
      name: `KS A-Member ${i + 1}`,
      email: `member.ks.a${i + 1}@interdomestik.com`,
      role: 'member' as const,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      memberNumber: `MEM-2026-00000${i + 2}`,
      memberNumberIssuedAt: at(),
    })),
    ...Array.from({ length: 4 }).map((_, i) => ({
      id: goldenId(`ks_b_member_${i + 1}`),
      name: `KS B-Member ${i + 1}`,
      email: `member.ks.b${i + 1}@interdomestik.com`,
      role: 'member' as const,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_b',
      memberNumber: `MEM-2026-0000${8 + i}`,
      memberNumberIssuedAt: at(),
    })),
    ...Array.from({ length: 2 }).map((_, i) => ({
      id: goldenId(`ks_c_member_${i + 1}`),
      name: `KS C-Member ${i + 1}`,
      email: `member.ks.c${i + 1}@interdomestik.com`,
      role: 'member' as const,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_c',
      memberNumber: `MEM-2026-0000${12 + i}`,
      memberNumberIssuedAt: at(),
    })),
    {
      id: goldenId('ks_empty_member'),
      name: 'KS Empty Member',
      email: 'member.ks.empty@interdomestik.com',
      role: 'member' as const,
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      memberNumber: 'MEM-2026-000015',
      memberNumberIssuedAt: at(),
    },
    {
      id: goldenId('agent_balkan_1'),
      name: 'Balkan Agent 1',
      email: 'agent.balkan.1@interdomestik.com',
      role: 'agent',
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
    },
    {
      id: goldenId('ks_member_tracking'),
      name: 'KS Tracking Demo',
      email: 'member.tracking.ks@interdomestik.com',
      role: 'member',
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      agentId: goldenId('ks_agent_a1'),
      memberNumber: 'MEM-2026-000014',
      memberNumberIssuedAt: at(),
    },
  ];
}

export async function seedUsers(context: SeedGoldenContext) {
  const { at, db, schema } = context;

  console.log('👥 Seeding Users & Credentials...');
  const hashedPassword = hashPassword(E2E_PASSWORD);

  for (const u of buildUsersToSeed({ at })) {
    await db
      .insert(schema.user)
      .values({
        ...u,
        emailVerified: true,
        createdAt: at(),
        updatedAt: at(),
      })
      .onConflictDoUpdate({
        target: schema.user.id,
        set: {
          name: u.name,
          role: u.role,
          branchId: 'branchId' in u ? (u.branchId as string) : null,
          agentId: 'agentId' in u ? (u.agentId as string) : null,
          tenantId: u.tenantId,
          memberNumber: 'memberNumber' in u ? (u.memberNumber as string) : null,
          memberNumberIssuedAt:
            'memberNumberIssuedAt' in u ? (u.memberNumberIssuedAt as Date) : null,
        },
      });

    await db
      .insert(schema.account)
      .values({
        id: `${u.id}-credential`,
        accountId: u.email,
        providerId: 'credential',
        userId: u.id,
        password: hashedPassword,
        createdAt: at(),
        updatedAt: at(),
      })
      .onConflictDoUpdate({
        target: schema.account.id,
        set: {
          password: hashedPassword,
          accountId: u.email,
          updatedAt: at(),
        },
      });
  }
}
