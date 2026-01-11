import { TENANTS, WORKLOAD_PREFIX } from './constants';

export async function upsertTenantsAndBranches(db: any, schema: any) {
  console.log('🏢 Ensuring Tenants & Branches...');

  // Tenants are usually shared but we upsert for safety
  await db
    .insert(schema.tenants)
    .values([
      {
        id: TENANTS.MK,
        name: 'North Macedonia',
        countryCode: 'MK',
        contact: { email: 'support.mk@interdomestik.com' },
        legalName: 'Interdomestik MK DOOEL',
      },
      {
        id: TENANTS.KS,
        name: 'Kosovo',
        countryCode: 'XK',
        contact: { email: 'support.ks@interdomestik.com' },
        legalName: 'Interdomestik KS LLC',
      },
    ])
    .onConflictDoNothing();

  const workloadBranches = [
    {
      id: `${WORKLOAD_PREFIX}ks_branch_1`,
      name: 'KS Workload Branch 1',
      tenantId: TENANTS.KS,
      slug: 'work-ks-1',
      code: 'W-KS-1',
    },
    {
      id: `${WORKLOAD_PREFIX}ks_branch_2`,
      name: 'KS Workload Branch 2',
      tenantId: TENANTS.KS,
      slug: 'work-ks-2',
      code: 'W-KS-2',
    },
    {
      id: `${WORKLOAD_PREFIX}ks_branch_3`,
      name: 'KS Workload Branch 3',
      tenantId: TENANTS.KS,
      slug: 'work-ks-3',
      code: 'W-KS-3',
    },
    {
      id: `${WORKLOAD_PREFIX}mk_branch_1`,
      name: 'MK Workload Branch 1',
      tenantId: TENANTS.MK,
      slug: 'work-mk-1',
      code: 'W-MK-1',
    },
    {
      id: `${WORKLOAD_PREFIX}mk_branch_2`,
      name: 'MK Workload Branch 2',
      tenantId: TENANTS.MK,
      slug: 'work-mk-2',
      code: 'W-MK-2',
    },
  ];

  for (const b of workloadBranches) {
    await db
      .insert(schema.branches)
      .values(b)
      .onConflictDoUpdate({
        target: schema.branches.id,
        set: { name: b.name, code: b.code },
      });
  }

  return workloadBranches;
}
