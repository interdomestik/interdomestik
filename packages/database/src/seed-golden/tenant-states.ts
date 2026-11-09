import {
  E2E_BRANCH_STATE_FIXTURES,
  E2E_TENANT_STATE_FIXTURES,
  E2E_TENANT_STATE_INSTANTS,
} from '../e2e-tenant-state-fixtures';
import { excludedSet } from '../seed-utils/excluded-set';
import type { SeedGoldenContext } from './types';

export function buildTenantStatesToSeed() {
  return Object.values(E2E_TENANT_STATE_FIXTURES).map(fixture => ({
    ...fixture,
    currency: 'EUR',
    createdAt: new Date(E2E_TENANT_STATE_INSTANTS.CREATED),
    updatedAt: new Date(E2E_TENANT_STATE_INSTANTS[fixture.isActive ? 'CREATED' : 'DEACTIVATED']),
  }));
}

export function buildInactiveBranchToSeed() {
  return {
    ...E2E_BRANCH_STATE_FIXTURES.INACTIVE_BRANCH,
    createdAt: new Date(E2E_TENANT_STATE_INSTANTS.CREATED),
    updatedAt: new Date(E2E_TENANT_STATE_INSTANTS.DEACTIVATED),
  };
}

export async function seedTenantStates({
  db,
  schema,
}: Pick<SeedGoldenContext, 'db' | 'schema'>): Promise<void> {
  const rows = buildTenantStatesToSeed();
  await db
    .insert(schema.tenants)
    .values(rows)
    .onConflictDoUpdate({
      target: schema.tenants.id,
      set: excludedSet(schema.tenants, rows[0]),
    });
}

export async function seedInactiveBranch({
  db,
  schema,
}: Pick<SeedGoldenContext, 'db' | 'schema'>): Promise<void> {
  const row = buildInactiveBranchToSeed();
  await db
    .insert(schema.branches)
    .values(row)
    .onConflictDoUpdate({
      target: schema.branches.id,
      set: excludedSet(schema.branches, row),
    });
}
