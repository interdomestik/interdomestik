import { db } from '../db';
import * as schema from '../schema';
import { BRANCHES, TENANTS } from './constants';

export async function seedClaimsAndFlows() {
  console.log('📝 Seeding Claims and Workflows...');

  const branchesMK = BRANCHES.filter(b => b.tenantId === TENANTS.MK);
  const branchesKS = BRANCHES.filter(b => b.tenantId === TENANTS.KS);

  // Status mapping fix:
  // in_review -> evaluation
  // approved -> resolved
  // paid -> resolved (since paid isn't a status in enum)
  const CLAIMS_DATA = [
    {
      id: 'full_claim_mk_1',
      userId: 'golden_mk_member_1',
      branchId: branchesMK[0].id,
      status: 'submitted',
      title: 'Fender Bender Skopje',
      amount: '350.00',
    },
    {
      id: 'full_claim_mk_2',
      userId: 'golden_mk_member_1',
      branchId: branchesMK[0].id,
      status: 'evaluation', // Fixed from in_review
      title: 'Broken Windshield',
      amount: '120.00',
    },
    {
      id: 'full_claim_mk_3',
      userId: 'full_mk_member_4',
      branchId: branchesMK[0].id,
      status: 'resolved', // Fixed from approved
      title: 'Hail Damage',
      amount: '800.00',
    },
    {
      id: 'full_claim_mk_4',
      userId: 'full_mk_member_6',
      branchId: branchesMK[1].id,
      status: 'rejected',
      title: 'Suspicious Collision',
      amount: '2000.00',
    },
    {
      id: 'full_claim_ks_1',
      userId: 'golden_ks_member_1',
      branchId: branchesKS[0].id,
      status: 'submitted',
      title: 'Pristina Parking Bump',
      amount: '150.00',
    },
    {
      id: 'full_claim_ks_2',
      userId: 'full_ks_member_4',
      branchId: branchesKS[1].id,
      status: 'resolved', // Fixed from paid
      title: 'Prizren Towing',
      amount: '90.00',
    },
  ];

  for (const c of CLAIMS_DATA) {
    const tenantId = c.branchId.startsWith('mk') ? TENANTS.MK : TENANTS.KS;

    await db
      .insert(schema.claims)
      .values({
        id: c.id,
        userId: c.userId,
        tenantId: tenantId,
        branchId: c.branchId,
        status: c.status as any,
        title: c.title,
        claimAmount: c.amount,
        currency: 'EUR',
        description: 'Seeded claim for testing.',
        category: 'vehicle',
        companyName: 'Test Insurer',
        createdAt: new Date(),
        updatedAt: new Date(),
      })
      .onConflictDoUpdate({ target: schema.claims.id, set: { status: c.status as any } });

    if (c.id === 'full_claim_mk_1') {
      await db
        .insert(schema.claimDocuments)
        .values({
          id: 'doc_mk_1',
          tenantId: tenantId,
          claimId: c.id,
          uploadedBy: c.userId,
          category: 'evidence',
          filePath: 'claims/evidence/placeholder.pdf',
          name: 'Police Report.pdf',
          fileType: 'application/pdf',
          fileSize: 1024,
          bucket: 'claim-evidence',
          classification: 'pii',
          createdAt: new Date(),
        })
        .onConflictDoNothing();
    }
  }
}
