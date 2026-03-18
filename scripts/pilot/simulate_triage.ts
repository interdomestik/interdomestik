import { claims, claimStageHistory, db, eq, user, desc } from '@interdomestik/database';
import crypto from 'node:crypto';

async function main() {
  console.log('[Triage] Connecting to Database...');

  const staffEmail = 'staff.ks.extra@interdomestik.com';
  const memberEmail = 'member.ks.a1@interdomestik.com';

  const staff = await db.query.user.findFirst({ where: eq(user.email, staffEmail) });
  const member = await db.query.user.findFirst({ where: eq(user.email, memberEmail) });

  if (!staff || !member) {
    throw new Error('Could not find Staff or Member users');
  }

  console.log(`[Triage] Staff: ${staff.id}, Member: ${member.id}`);

  // Find the last claim for that member
  const targetClaim = await db.query.claims.findFirst({
    where: eq(claims.userId, member.id),
    orderBy: [desc(claims.createdAt)],
  });

  if (!targetClaim) {
    throw new Error('No claim found for member to triage');
  }

  console.log(`[Triage] Targeting Claim: ${targetClaim.id} ("${targetClaim.title}")`);

  if (targetClaim.status === 'verification') {
    console.log('[Triage] Claim is ALREADY in verification status.');
    return;
  }

  console.log('[Triage] Updating Claim status and assignment...');

  // 1. Update Claim
  await db
    .update(claims)
    .set({
      staffId: staff.id,
      status: 'verification',
      statusUpdatedAt: new Date(),
    })
    .where(eq(claims.id, targetClaim.id));

  console.log('✅ Claim updated to staff custody and verification status.');

  // 2. Insert Stage History
  await db.insert(claimStageHistory).values({
    id: crypto.randomUUID(),
    claimId: targetClaim.id,
    fromStatus: targetClaim.status,
    toStatus: 'verification',
    actorId: staff.id,
    isPublic: true,
    reason: 'Live Pilot Day 1 Automated Triage Simulation',
    tenantId: targetClaim.tenantId,
  });

  console.log('✅ Stage history (triage) injected.');
  console.log('🎉 DB Triage Simulation Finished Successfully!');
}

main().catch(err => {
  console.error('[Triage] Error:', err);
  process.exit(1);
});
