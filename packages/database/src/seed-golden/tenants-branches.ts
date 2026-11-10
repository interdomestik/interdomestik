import { E2E_CASH_STATES_BRANCH } from '../e2e-cash-fixtures';
import { e2eEmail } from '../e2e-users';
import { TENANTS } from './constants';
import { buildInactiveBranchToSeed, seedInactiveBranch, seedTenantStates } from './tenant-states';
import type { SeedGoldenContext } from './types';

function buildExistingBranchesToSeed() {
  return [
    {
      id: 'mk_branch_a',
      name: 'MK Branch A (Main)',
      tenantId: TENANTS.MK,
      slug: 'mk-branch-a',
      code: 'MK-A',
    },
    {
      id: 'mk_branch_b',
      name: 'MK Branch B (East)',
      tenantId: TENANTS.MK,
      slug: 'mk-branch-b',
      code: 'MK-B',
    },
    {
      id: 'ks_branch_a',
      name: 'KS Branch A (Prishtina)',
      tenantId: TENANTS.KS,
      slug: 'ks-branch-a',
      code: 'KS-A',
    },
    {
      id: 'ks_branch_b',
      name: 'KS Branch B (Prizren)',
      tenantId: TENANTS.KS,
      slug: 'ks-branch-b',
      code: 'KS-B',
    },
    {
      id: 'ks_branch_c',
      name: 'KS Branch C (Peja)',
      tenantId: TENANTS.KS,
      slug: 'ks-branch-c',
      code: 'KS-C',
    },
    { ...E2E_CASH_STATES_BRANCH, tenantId: TENANTS.KS },
    {
      id: 'mk_branch_empty',
      name: 'MK Branch Empty',
      tenantId: TENANTS.MK,
      slug: 'mk-branch-empty',
      code: 'MK-E',
    },
    {
      id: 'pilot_branch_prishtina_central',
      name: 'Pilot Central Branch (Prishtina)',
      tenantId: TENANTS.PILOT,
      slug: 'pilot-prishtina-central',
      code: 'PILOT-PR',
    },
  ];
}

export function buildBranchesToSeed() {
  return [...buildExistingBranchesToSeed(), buildInactiveBranchToSeed()];
}

export async function seedTenants({ db, schema, sql }: SeedGoldenContext) {
  console.log('🏢 Seeding Tenants...');
  await db
    .insert(schema.tenants)
    .values([
      {
        id: TENANTS.MK,
        name: 'North Macedonia',
        contact: { email: e2eEmail('support.mk') },
        legalName: 'Interdomestik MK DOOEL',
        code: 'MK',
        countryCode: 'MK',
      },
      {
        id: TENANTS.PILOT,
        name: 'Pilot Macedonia',
        contact: { email: e2eEmail('support.pilot') },
        legalName: 'Interdomestik Pilot MK',
        code: 'MK-PILOT',
        countryCode: 'MK',
      },
      {
        id: TENANTS.KS,
        name: 'Kosovo',
        contact: { email: e2eEmail('support.ks') },
        legalName: 'Interdomestik KS LLC',
        code: 'KS',
        countryCode: 'XK',
      },
    ])
    .onConflictDoUpdate({
      target: schema.tenants.id,
      set: { name: schema.tenants.name, code: sql`excluded.code` },
    });
  await seedTenantStates({ db, schema });
  // Golden tenants exercise the post-pilot multi-branch journeys, including pilot CRUD.
  await db
    .insert(schema.tenantSettings)
    .values(buildMultiBranchSettingsToSeed())
    .onConflictDoUpdate({
      target: [
        schema.tenantSettings.tenantId,
        schema.tenantSettings.category,
        schema.tenantSettings.key,
      ],
      set: {
        tenantId: schema.tenantSettings.tenantId,
        category: 'branches',
        key: 'multi_branch',
        value: { enabled: true },
      },
    });
}

export function buildMultiBranchSettingsToSeed() {
  return [TENANTS.KS, TENANTS.MK, TENANTS.PILOT].map(tenantId => ({
    id: `golden_multi_branch_${tenantId}`,
    tenantId,
    category: 'branches',
    key: 'multi_branch',
    value: { enabled: true },
  }));
}

export async function seedBranches({ db, schema }: SeedGoldenContext) {
  console.log('🌿 Seeding Branches...');
  await db
    .insert(schema.branches)
    .values(buildExistingBranchesToSeed())
    .onConflictDoUpdate({
      target: schema.branches.id,
      set: { name: schema.branches.name, code: schema.branches.code },
    });
  await seedInactiveBranch({ db, schema });
}
