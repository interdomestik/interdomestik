import {
  account,
  branches,
  claims,
  db,
  E2E_PASSWORD,
  E2E_USERS,
  session,
  tenants,
  user,
} from '@interdomestik/database';
import { claimLifecycleFieldsForStatus } from '@interdomestik/database/claim-lifecycle';
import { and, eq, inArray } from 'drizzle-orm';
import { randomUUID } from 'node:crypto';

type FixtureUser = {
  id: string;
  email: string;
};

export type BranchOverviewScopeFixture = {
  tenantAdmin: FixtureUser;
  agent: FixtureUser & { name: string };
  branchManager: FixtureUser;
  missingBranchManager: FixtureUser;
  branches: {
    own: { id: string; name: string };
    sibling: { id: string; name: string };
    foreign: { id: string; name: string };
  };
  password: string;
  staffName: string;
};

export async function withBranchOverviewScopeFixture<T>(
  projectName: string,
  action: (fixture: BranchOverviewScopeFixture) => Promise<T>
): Promise<T> {
  const isMk = projectName.includes('mk');
  const seededManagerEmail = isMk
    ? E2E_USERS.MK_BRANCH_MANAGER.email
    : E2E_USERS.KS_BRANCH_MANAGER.email;
  const seededManager = await db.query.user.findFirst({
    where: eq(user.email, seededManagerEmail),
  });
  if (!seededManager?.tenantId) {
    throw new Error(`Missing seeded branch manager: ${seededManagerEmail}`);
  }

  const credential = await db.query.account.findFirst({
    where: and(eq(account.userId, seededManager.id), eq(account.providerId, 'credential')),
  });
  if (!credential?.password) throw new Error('Missing seeded branch-manager credential');

  const prefix = `s2-${randomUUID()}`;
  const targetTenantId = seededManager.tenantId;
  const foreignTenantId = `${prefix}-tenant-foreign`;
  const at = new Date();
  const old = new Date(at.getTime() - 45 * 24 * 60 * 60 * 1000);
  const ownBranch = { id: `${prefix}-a`, name: `${prefix} Branch A` };
  const siblingBranch = { id: `${prefix}-b`, name: `${prefix} Branch B` };
  const foreignBranch = { id: `${prefix}-foreign`, name: `${prefix} Foreign Branch` };
  const tenantAdmin = {
    id: `${prefix}-tenant-admin`,
    email: `${prefix}-tenant-admin@example.com`,
  };
  const branchManager = { id: `${prefix}-manager`, email: `${prefix}-manager@example.com` };
  const missingBranchManager = {
    id: `${prefix}-missing-manager`,
    email: `${prefix}-missing-manager@example.com`,
  };
  const agent = {
    id: `${prefix}-agent`,
    email: `${prefix}-agent@example.com`,
    name: `${prefix} Agent`,
  };
  const staff = { id: `${prefix}-staff`, email: `${prefix}-staff@example.com` };
  const staffName = `${prefix} Staff`;
  const members = [
    { id: `${prefix}-member-a`, tenantId: targetTenantId, branchId: ownBranch.id },
    { id: `${prefix}-member-b`, tenantId: targetTenantId, branchId: siblingBranch.id },
    { id: `${prefix}-member-foreign`, tenantId: foreignTenantId, branchId: foreignBranch.id },
  ];
  const claimIds = [
    `${prefix}-claim-a`,
    `${prefix}-claim-b-1`,
    `${prefix}-claim-b-2`,
    `${prefix}-claim-foreign`,
  ];
  const authenticatedUserIds = [tenantAdmin.id, branchManager.id, missingBranchManager.id];
  const allUserIds = [
    ...authenticatedUserIds,
    agent.id,
    staff.id,
    ...members.map(member => member.id),
  ];
  const allBranchIds = [ownBranch.id, siblingBranch.id, foreignBranch.id];

  try {
    await db.insert(tenants).values({
      id: foreignTenantId,
      name: `${prefix} Foreign Tenant`,
      legalName: `${prefix} Foreign Tenant`,
      countryCode: isMk ? 'XK' : 'MK',
      createdAt: at,
      updatedAt: at,
    });

    await db.insert(branches).values([
      {
        ...ownBranch,
        tenantId: targetTenantId,
        slug: `${prefix}-a`,
        code: `${prefix.slice(0, 11)}-A`,
      },
      {
        ...siblingBranch,
        tenantId: targetTenantId,
        slug: `${prefix}-b`,
        code: `${prefix.slice(0, 11)}-B`,
      },
      {
        ...foreignBranch,
        tenantId: foreignTenantId,
        slug: `${prefix}-foreign`,
        code: `${prefix.slice(0, 11)}-F`,
      },
    ]);

    await db.insert(user).values([
      {
        ...tenantAdmin,
        tenantId: targetTenantId,
        name: `${prefix} Tenant Admin`,
        role: 'tenant_admin',
        emailVerified: true,
        createdAt: at,
        updatedAt: at,
      },
      {
        ...branchManager,
        tenantId: targetTenantId,
        branchId: ownBranch.id,
        name: `${prefix} Manager`,
        role: 'branch_manager',
        emailVerified: true,
        createdAt: at,
        updatedAt: at,
      },
      {
        ...missingBranchManager,
        tenantId: targetTenantId,
        branchId: null,
        name: `${prefix} Missing Manager`,
        role: 'branch_manager',
        emailVerified: true,
        createdAt: at,
        updatedAt: at,
      },
      {
        ...agent,
        tenantId: targetTenantId,
        branchId: ownBranch.id,
        role: 'agent',
        emailVerified: true,
        createdAt: at,
        updatedAt: at,
      },
      {
        ...staff,
        tenantId: targetTenantId,
        branchId: null,
        name: staffName,
        role: 'staff',
        emailVerified: true,
        createdAt: at,
        updatedAt: at,
      },
      ...members.map(member => ({
        ...member,
        name: member.id,
        email: `${member.id}@example.com`,
        role: 'member' as const,
        emailVerified: true,
        createdAt: at,
        updatedAt: at,
      })),
    ]);

    await db.insert(account).values(
      [tenantAdmin, branchManager, missingBranchManager].map(owner => ({
        id: `${owner.id}-credential`,
        accountId: owner.email,
        providerId: 'credential',
        userId: owner.id,
        password: credential.password,
        createdAt: at,
        updatedAt: at,
      }))
    );

    await db.insert(claims).values([
      {
        id: claimIds[0],
        tenantId: targetTenantId,
        branchId: ownBranch.id,
        userId: members[0].id,
        agentId: agent.id,
        staffId: staff.id,
        title: `${prefix} own claim`,
        category: 'vehicle',
        companyName: 'S2 fixture',
        ...claimLifecycleFieldsForStatus('submitted'),
        createdAt: old,
        updatedAt: at,
      },
      ...claimIds.slice(1, 3).map((id, index) => ({
        id,
        tenantId: targetTenantId,
        branchId: siblingBranch.id,
        userId: members[1].id,
        agentId: agent.id,
        staffId: staff.id,
        title: `${prefix} sibling claim ${index + 1}`,
        category: 'vehicle',
        companyName: 'S2 fixture',
        ...claimLifecycleFieldsForStatus('submitted'),
        createdAt: old,
        updatedAt: at,
      })),
      {
        id: claimIds[3],
        tenantId: foreignTenantId,
        branchId: foreignBranch.id,
        userId: members[2].id,
        agentId: agent.id,
        title: `${prefix} foreign claim`,
        category: 'vehicle',
        companyName: 'S2 fixture',
        ...claimLifecycleFieldsForStatus('submitted'),
        createdAt: old,
        updatedAt: at,
      },
    ]);

    return await action({
      agent,
      branchManager,
      missingBranchManager,
      branches: { own: ownBranch, sibling: siblingBranch, foreign: foreignBranch },
      password: E2E_PASSWORD,
      staffName,
      tenantAdmin,
    });
  } finally {
    await db.delete(claims).where(inArray(claims.id, claimIds));
    await db.delete(session).where(inArray(session.userId, authenticatedUserIds));
    await db.delete(account).where(inArray(account.userId, authenticatedUserIds));
    await db.delete(user).where(inArray(user.id, allUserIds));
    await db.delete(branches).where(inArray(branches.id, allBranchIds));
    await db.delete(tenants).where(eq(tenants.id, foreignTenantId));
  }
}
