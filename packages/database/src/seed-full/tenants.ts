import { db } from '../db';
import * as schema from '../schema';
import { BRANCHES, TENANTS } from './constants';

export async function seedTenantsAndBranches() {
  console.log('🏢 Seeding Tenants and Branches...');

  await db
    .insert(schema.tenants)
    .values([
      {
        id: TENANTS.MK,
        name: 'North Macedonia',
        contact: { email: 'support.mk@interdomestik.com' },
        legalName: 'Interdomestik MK DOOEL',
        countryCode: 'MK',
      },
      {
        id: TENANTS.KS,
        name: 'Kosovo',
        contact: { email: 'support.ks@interdomestik.com' },
        legalName: 'Interdomestik KS LLC',
        countryCode: 'XK',
      },
    ])
    .onConflictDoUpdate({ target: schema.tenants.id, set: { name: schema.tenants.name } });

  await db
    .insert(schema.branches)
    .values(BRANCHES)
    .onConflictDoUpdate({
      target: schema.branches.id,
      set: { name: schema.branches.name, code: schema.branches.code },
    });
}
