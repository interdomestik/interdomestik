import dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import crypto from 'node:crypto';
import { desc, eq } from 'drizzle-orm';
import { closePilotDatabase, importPilotDatabase } from './import-pilot-database';

const {
  claimLifecycleFieldsForStatus,
  claimStatusFromLifecycleFields,
  db,
  claims,
  claimStageHistory,
  user,
} = await importPilotDatabase();

async function main() {
  console.log('[Triage] Connecting to Database...');

  const staffEmail = 'staff.ks.extra@plan070.example.invalid';
  const memberEmail = 'member.ks.a1@plan070.example.invalid';

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

  const targetStatus = claimStatusFromLifecycleFields(targetClaim);

  if (targetStatus === 'verification') {
    console.log('[Triage] Claim is ALREADY in verification status.');
    return;
  }

  console.log('[Triage] Updating Claim status and assignment...');

  // 1. Update Claim
  await db
    .update(claims)
    .set({
      staffId: staff.id,
      ...claimLifecycleFieldsForStatus('verification'),
      statusUpdatedAt: new Date(),
    })
    .where(eq(claims.id, targetClaim.id));

  console.log('✅ Claim updated to staff custody and verification status.');

  // 2. Insert Stage History
  await db.insert(claimStageHistory).values({
    id: crypto.randomUUID(),
    claimId: targetClaim.id,
    fromStatus: targetStatus,
    toStatus: 'verification',
    changedById: staff.id,
    changedByRole: 'staff',
    isPublic: true,
    note: 'Live Pilot Day 1 Automated Triage Simulation',
    tenantId: targetClaim.tenantId,
  });

  console.log('✅ Stage history (triage) injected.');
  console.log('🎉 DB Triage Simulation Finished Successfully!');
}

try {
  await main();
  await closePilotDatabase();
} catch (err) {
  console.error('[Triage] Error:', err);
  await closePilotDatabase();
  process.exit(1);
}
