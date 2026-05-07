import { TENANTS } from './constants';
import type { SeedGoldenContext } from './types';

export function buildBranchesToSeed() {
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

export async function seedTenants({ db, schema, sql }: SeedGoldenContext) {
  console.log('🏢 Seeding Tenants...');
  await db
    .insert(schema.tenants)
    .values([
      {
        id: TENANTS.MK,
        name: 'North Macedonia',
        contact: { email: 'support.mk@interdomestik.com' },
        legalName: 'Interdomestik MK DOOEL',
        code: 'MK',
        countryCode: 'MK',
      },
      {
        id: TENANTS.PILOT,
        name: 'Pilot Macedonia',
        contact: { email: 'support.pilot@interdomestik.com' },
        legalName: 'Interdomestik Pilot MK',
        code: 'MK-PILOT',
        countryCode: 'MK',
      },
      {
        id: TENANTS.KS,
        name: 'Kosovo',
        contact: { email: 'support.ks@interdomestik.com' },
        legalName: 'Interdomestik KS LLC',
        code: 'KS',
        countryCode: 'XK',
      },
    ])
    .onConflictDoUpdate({
      target: schema.tenants.id,
      set: { name: schema.tenants.name, code: sql`excluded.code` },
    });
}

export async function seedBranches({ db, schema }: SeedGoldenContext) {
  console.log('🌿 Seeding Branches...');
  await db
    .insert(schema.branches)
    .values(buildBranchesToSeed())
    .onConflictDoUpdate({
      target: schema.branches.id,
      set: { name: schema.branches.name, code: schema.branches.code },
    });
}
