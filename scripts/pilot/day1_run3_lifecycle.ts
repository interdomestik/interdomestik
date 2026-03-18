import {
  claims,
  claimMessages,
  claimStageHistory,
  notifications,
  claimDocuments,
  claimEscalationAgreements,
  db,
  eq,
  user,
} from '@interdomestik/database';
import crypto from 'node:crypto';

async function main() {
  console.log('[Seeder Run3] Connecting to Database...');

  const staffEmail = 'staff.ks.extra@interdomestik.com';
  const staff = await db.query.user.findFirst({ where: eq(user.email, staffEmail) });

  if (!staff) {
    throw new Error('Could not find required Staff user for handling simulation');
  }

  const tenantId = 'tenant_ks';
  const categories = ['vehicle', 'home', 'medical'];
  const createdClaims: any[] = [];

  console.log('[Seeder Run3] Creating 3 Virtual Members...');
  const memberIds: string[] = [];

  for (let j = 1; j <= 3; j++) {
    const memberId = `member_run3_${j}_${crypto.randomBytes(4).toString('hex')}`;
    const email = `member.run3.${j}@interdomestik.com`;

    // Check if user already exists to make script re-runnable or just insert
    const existing = await db.query.user.findFirst({ where: eq(user.email, email) });
    if (existing) {
      memberIds.push(existing.id);
      console.log(` 📌 Member ${j} already exists (${existing.id})`);
      continue;
    }

    await db.insert(user).values({
      id: memberId,
      tenantId,
      name: `Run 3 Pilot Member #${j}`,
      email,
      emailVerified: true,
      role: 'member',
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    memberIds.push(memberId);
    console.log(` ✅ Created Member #${j} (${memberId})`);
  }

  console.log(`[Seeder Run3] Creating 3 claims per member (9 total) across categories...`);

  for (const mId of memberIds) {
    for (const cat of categories) {
      const claimId = crypto.randomUUID();

      await db.insert(claims).values({
        id: claimId,
        tenantId,
        userId: mId,
        staffId: staff.id, // Assign to staff directly representing "handling"
        title: `Live Pilot Run 3 Claim (${cat})`,
        category: cat,
        companyName: 'Interdomestik Test Group',
        origin: 'portal',
        status: 'submitted',
        createdAt: new Date(),
      });

      createdClaims.push({ id: claimId, userId: mId, category: cat });
      console.log(`   ✅ Claim Created (${claimId}) Category: ${cat}`);
    }
  }

  console.log('[Seeder Run3] Advancing All Claims through Lifecycle Steps...');

  for (const c of createdClaims) {
    // 1. submitted -> verification
    await db.insert(claimStageHistory).values({
      id: crypto.randomUUID(),
      tenantId,
      claimId: c.id,
      fromStatus: 'submitted',
      toStatus: 'verification',
      changedById: staff.id,
      changedByRole: 'staff',
      isPublic: true,
      note: 'Standard verification checks',
    });

    // 2. verification -> evaluation
    await db.insert(claimStageHistory).values({
      id: crypto.randomUUID(),
      tenantId,
      claimId: c.id,
      fromStatus: 'verification',
      toStatus: 'evaluation',
      changedById: staff.id,
      changedByRole: 'staff',
      isPublic: true,
      note: 'Commencing Evaluation phase',
    });

    // 📩 Insert Document Evidence during Evaluation
    await db.insert(claimDocuments).values({
      id: crypto.randomUUID(),
      tenantId,
      claimId: c.id,
      name: `damage_report_${c.category}.pdf`,
      filePath: `/tmp/damage_report_${c.id}.pdf`,
      fileType: 'application/pdf',
      fileSize: 1024 * 350, // 350KB
      uploadedBy: staff.id,
      category: 'evidence',
      classification: 'generic',
    });

    // 📩 Insert Escalation Settlement Agreement
    await db.insert(claimEscalationAgreements).values({
      id: crypto.randomUUID(),
      tenantId,
      claimId: c.id,
      decisionType: 'accepted',
      decisionNextStatus: 'negotiation', // mapped standard choice
      decisionReason: 'Claim value approved by adjuster',
      acceptedById: staff.id,
      signedByUserId: c.userId,
      signedAt: new Date(),
      acceptedAt: new Date(),
      feePercentage: 10,
      successFeeRecoveredAmount: '1500.00',
      successFeeAmount: '150.00',
    });

    // 3. evaluation -> resolved
    await db
      .update(claims)
      .set({
        status: 'resolved',
        statusUpdatedAt: new Date(),
      })
      .where(eq(claims.id, c.id));

    await db.insert(claimStageHistory).values({
      id: crypto.randomUUID(),
      tenantId,
      claimId: c.id,
      fromStatus: 'evaluation',
      toStatus: 'resolved',
      changedById: staff.id,
      changedByRole: 'staff',
      isPublic: true,
      note: 'Claim fully settled and resolved!',
    });

    // 📩 In-App Notification alert
    await db.insert(notifications).values({
      id: crypto.randomUUID(),
      tenantId,
      userId: c.userId,
      type: 'claim_update',
      title: 'Claim Resolved!',
      content: `Your claim for ${c.category} has been successfully settled and resolved.`,
      isRead: false,
    });

    // 📩 Completion Message note
    await db.insert(claimMessages).values({
      id: crypto.randomUUID(),
      tenantId,
      claimId: c.id,
      senderId: staff.id,
      content: `Dear Member, your claim has been fully resolved with a settlement fee calculated. Documentation is attached.`,
      isInternal: false,
    });

    console.log(` ✅ Fully Resolved Claim ${c.id}`);
  }

  console.log('🎉 Full Lifecycle Multi-Member Seeder Run 3 Finished Successfully!');
}

try {
  await main();
} catch (err) {
  console.error('[Seeder Run3] Error:', err);
  process.exit(1);
}
