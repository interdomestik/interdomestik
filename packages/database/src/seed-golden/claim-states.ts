import {
  E2E_CLAIM_STATE_FIXTURES,
  E2E_CLAIM_STATES_BRANCH_ID,
  e2eClaimStateInstant,
  type E2EClaimStateFixture,
} from '../e2e-claim-state-fixtures';
import { E2E_USER_IDS } from '../e2e-role-fixtures';
import { withClaimLifecycleFields } from '../seed-utils/claim-lifecycle';
import { excludedSet } from '../seed-utils/excluded-set';
import { TENANTS } from './constants';
import type { SeedGoldenContext } from './types';

const FIXTURES: readonly E2EClaimStateFixture[] = Object.values(E2E_CLAIM_STATE_FIXTURES);

/** Every named claim state as its transitions leave it; the draft was never assigned. */
export function buildClaimStatesToSeed() {
  return FIXTURES.map(fixture => {
    const staffId = fixture.staff ? E2E_USER_IDS[fixture.staff] : null;
    const decided = fixture.status !== 'draft';
    return withClaimLifecycleFields({
      id: fixture.id,
      tenantId: TENANTS.KS,
      branchId: E2E_CLAIM_STATES_BRANCH_ID,
      userId: E2E_USER_IDS[fixture.owner],
      agentId: E2E_USER_IDS[fixture.agent],
      staffId,
      assignedAt: staffId ? e2eClaimStateInstant('CREATED') : null,
      assignedById: staffId ? E2E_USER_IDS.KS_ADMIN : null,
      status: fixture.status,
      title: fixture.title,
      category: 'vehicle',
      companyName: 'KS States Insurer',
      claimAmount: '640.00',
      currency: 'EUR',
      createdAt: e2eClaimStateInstant('CREATED'),
      statusUpdatedAt: decided ? e2eClaimStateInstant('STATUS_CHANGED') : null,
    });
  });
}

/** Upserts restore each state on every run, so a drifted claim cannot survive a reseed. */
export async function seedClaimStates({ db, schema }: SeedGoldenContext) {
  console.log('🗂️ Seeding named claim states (KS-D)...');
  const claims = buildClaimStatesToSeed();
  await db
    .insert(schema.claims)
    .values(claims)
    .onConflictDoUpdate({
      target: schema.claims.id,
      set: excludedSet(schema.claims, claims[0]),
    });
}
