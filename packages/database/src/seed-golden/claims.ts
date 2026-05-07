import { goldenId } from '../seed-utils/seed-ids';
import {
  buildCommercialAgreementsToSeed,
  upsertCommercialAgreements,
} from './commercial-agreements';
import { TENANTS } from './constants';
import type { ClaimInsert, SeedGoldenContext } from './types';

const ksAStatuses = [
  'submitted',
  'submitted',
  'submitted',
  'submitted',
  'submitted',
  'submitted',
  'submitted',
  'submitted',
  'submitted',
  'verification',
  'verification',
  'verification',
  'verification',
  'evaluation',
  'evaluation',
  'evaluation',
  'evaluation',
  'negotiation',
  'negotiation',
  'negotiation',
  'court',
] as any[];

export function buildClaimsToSeed({
  at,
  schema,
}: Pick<SeedGoldenContext, 'at' | 'schema'>): ClaimInsert[] {
  const now = at();
  const claimsToSeed: (typeof schema.claims.$inferInsert)[] = [];

  ksAStatuses.forEach((status, i) => {
    const dayOffset = i < 9 ? i % 3 : i % 21;
    let createdAt = at(-dayOffset * 24 * 60 * 60 * 1000);

    if (i === 0) createdAt = at(-35 * 24 * 60 * 60 * 1000);
    if (i === 1) createdAt = at(-45 * 24 * 60 * 60 * 1000);

    const claimId = `ks_a_claim_${(i + 1).toString().padStart(2, '0')}`;
    const staffId = i < 7 ? goldenId('ks_staff') : i < 12 ? goldenId('ks_staff_2') : null;

    claimsToSeed.push({
      id: goldenId(claimId),
      userId: goldenId(`ks_a_member_${(i % 4) + 1}`),
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      agentId: goldenId('ks_agent_a1'),
      status,
      title: `KS-A ${status.toUpperCase()} Claim ${i + 1}`,
      category: 'vehicle',
      companyName: 'KS Insurance Co',
      claimAmount: '1200.00',
      createdAt,
      staffId,
      assignedAt: staffId ? now : null,
      assignedById: staffId ? goldenId('ks_admin') : null,
    });
  });

  Array.from({ length: 9 }).forEach((_, i) => {
    const status = (i < 5 ? 'submitted' : i < 7 ? 'verification' : 'evaluation') as any;
    const staffId = i < 4 ? goldenId('ks_staff') : null;
    claimsToSeed.push({
      id: goldenId(`ks_b_claim_${(i + 1).toString().padStart(2, '0')}`),
      userId: goldenId(`ks_b_member_${(i % 4) + 1}`),
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_b',
      agentId: goldenId('ks_b_agent_1'),
      status,
      title: `KS-B Claim ${i + 1}`,
      category: 'vehicle',
      companyName: 'KS West Insurer',
      claimAmount: '800.00',
      createdAt: at(-(i + 1) * 24 * 60 * 60 * 1000),
      staffId,
      assignedAt: staffId ? now : null,
      assignedById: staffId ? goldenId('ks_admin') : null,
    });
  });

  [1, 2].forEach(i => {
    claimsToSeed.push({
      id: goldenId(`ks_c_claim_${i.toString().padStart(2, '0')}`),
      userId: goldenId(`ks_c_member_${i}`),
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_c',
      agentId: goldenId('ks_c_agent_1'),
      status: i === 1 ? 'submitted' : 'verification',
      title: `KS-C Healthy Claim ${i}`,
      category: 'vehicle',
      companyName: 'Peja local',
      claimAmount: '450.00',
      createdAt: at(-i * 12 * 60 * 60 * 1000),
    });
  });

  claimsToSeed.push(
    {
      id: goldenId('claim_mk_1'),
      userId: goldenId('mk_member_1'),
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
      status: 'submitted',
      title: 'Rear ended in Skopje (Baseline)',
      category: 'vehicle',
      companyName: 'Test Insurer',
      claimAmount: '500.00',
      claimNumber: 'CLM-MK-2026-000001',
    },
    {
      id: goldenId('ks_track_claim_001'),
      userId: goldenId('ks_member_tracking'),
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      agentId: goldenId('ks_agent_a1'),
      status: 'evaluation',
      title: 'Aksident i lehtë – Demo Tracking',
      category: 'vehicle',
      companyName: 'KS Insurance Co',
      claimAmount: '250.00',
      currency: 'EUR',
      createdAt: at(-7 * 24 * 60 * 60 * 1000),
      updatedAt: at(-1 * 24 * 60 * 60 * 1000),
      staffId: goldenId('ks_staff'),
      assignedAt: at(-6 * 24 * 60 * 60 * 1000),
      assignedById: goldenId('ks_admin'),
      claimNumber: 'CLM-XK-2026-800001',
    },
    {
      id: goldenId('ks_track_claim_002'),
      userId: goldenId('ks_member_tracking'),
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      agentId: goldenId('ks_agent_a1'),
      status: 'submitted',
      title: 'Vonesë në shqyrtim – SLA Demo',
      category: 'property',
      companyName: 'KS Insurance Co',
      claimAmount: '120.00',
      createdAt: at(-40 * 24 * 60 * 60 * 1000),
      updatedAt: at(-10 * 24 * 60 * 60 * 1000),
      staffId: null,
    },
    {
      id: goldenId('ks_track_claim_003'),
      userId: goldenId('ks_member_tracking'),
      tenantId: TENANTS.KS,
      branchId: 'ks_branch_a',
      agentId: goldenId('ks_agent_a1'),
      status: 'resolved',
      title: 'E përfunduar – Demo',
      category: 'other',
      companyName: 'KS Insurance Co',
      claimAmount: '90.00',
      createdAt: at(-20 * 24 * 60 * 60 * 1000),
      updatedAt: at(-15 * 24 * 60 * 60 * 1000),
    },
    {
      id: goldenId('mk_track_claim_001'),
      userId: goldenId('mk_member_1'),
      tenantId: TENANTS.MK,
      branchId: 'mk_branch_a',
      agentId: goldenId('mk_agent_a1'),
      status: 'submitted',
      title: 'MK Deterministic Claim',
      category: 'vehicle',
      companyName: 'MK Auto Osiguruvanje',
      claimAmount: '300.00',
      currency: 'EUR',
      createdAt: at(-2 * 24 * 60 * 60 * 1000),
      claimNumber: 'CLM-MK-2026-900001',
    }
  );

  return claimsToSeed;
}

export async function seedClaims(context: SeedGoldenContext) {
  const { at, db, schema } = context;

  console.log('📝 Seeding CLAIM TRACKING PACK...');

  for (const c of buildClaimsToSeed({ at, schema })) {
    await db
      .insert(schema.claims)
      .values(c)
      .onConflictDoUpdate({
        target: schema.claims.id,
        set: {
          status: c.status,
          staffId: c.staffId,
          branchId: c.branchId,
          createdAt: c.createdAt,
          claimNumber: c.claimNumber,
        },
      });
  }

  await upsertCommercialAgreements({
    agreements: buildCommercialAgreementsToSeed({
      at,
      staffId: goldenId('ks_staff'),
      tenantId: TENANTS.KS,
    }),
    db,
    schema,
  });
}
