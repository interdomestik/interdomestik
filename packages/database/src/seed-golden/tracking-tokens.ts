import { goldenId } from '../seed-utils/seed-ids';
import { TENANTS } from './constants';
import type { SeedGoldenContext } from './types';

export async function buildTrackingTokenToSeed({ at }: Pick<SeedGoldenContext, 'at'>) {
  const crypto = await import('crypto');
  const rawToken = 'demo-ks-track-token-001';
  const tokenHash = crypto.createHash('sha256').update(rawToken).digest('hex');

  return {
    id: 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11',
    tenantId: TENANTS.KS,
    claimId: goldenId('ks_track_claim_001'),
    tokenHash,
    expiresAt: at(30 * 24 * 60 * 60 * 1000),
  };
}

export async function seedTrackingTokens(context: SeedGoldenContext) {
  const { db, schema } = context;

  console.log('🔗 Seeding Tracking Tokens...');
  await db
    .insert(schema.claimTrackingTokens)
    .values(await buildTrackingTokenToSeed(context))
    .onConflictDoNothing();
}
