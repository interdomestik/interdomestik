import { statuses, TENANTS, WORKLOAD_PREFIX } from './constants';

export async function seedWorkloadClaims(db: any, schema: any, members: any[], staff: any[]) {
  console.log('📝 Seeding Workload Claims...');

  const claims: any[] = [];
  const now = new Date();

  // KS: 45 claims
  const ksMembers = members.filter(m => m.tenantId === TENANTS.KS);
  const ksStaff = staff.filter(s => s.tenantId === TENANTS.KS);

  for (let i = 0; i < 45; i++) {
    const member = ksMembers[i % ksMembers.length];
    const s = ksStaff[i % ksStaff.length];
    const status = statuses[i % statuses.length];
    const isSlaBreach = i < 5; // First 5 KS claims are SLA breaches (old)
    const createdAt = isSlaBreach
      ? new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000) // 40 days ago
      : new Date(now.getTime() - (i % 30) * 24 * 60 * 60 * 1000);

    claims.push({
      id: `${WORKLOAD_PREFIX}ks_claim_${i + 1}`,
      tenantId: TENANTS.KS,
      branchId: member.branchId,
      memberId: member.id, // Keep for reference if needed, but userId is key
      userId: member.id,
      staffId: s.id,
      status,
      incidentDate: new Date(createdAt.getTime() - 1 * 24 * 60 * 60 * 1000),
      createdAt,
      updatedAt: now,
      assignedAt: now,
      assignedById: s.id, // self-assigned for seed sim
      description: `Workload demo claim #${i + 1} for KS`,
      title: `Claim #${i + 1} - ${status}`,
      category: 'consumer_rights',
      companyName: 'Demo Company KS',
    });
  }

  // MK: 25 claims
  const mkMembers = members.filter(m => m.tenantId === TENANTS.MK);
  const mkStaff = staff.filter(s => s.tenantId === TENANTS.MK);

  for (let i = 0; i < 25; i++) {
    const member = mkMembers[i % mkMembers.length];
    const s = mkStaff[i % mkStaff.length];
    const status = statuses[i % statuses.length];
    const isSlaBreach = i < 3; // First 3 MK claims are SLA breaches
    const createdAt = isSlaBreach
      ? new Date(now.getTime() - 45 * 24 * 60 * 60 * 1000)
      : new Date(now.getTime() - (i % 20) * 24 * 60 * 60 * 1000);

    claims.push({
      id: `${WORKLOAD_PREFIX}mk_claim_${i + 1}`,
      tenantId: TENANTS.MK,
      branchId: member.branchId,
      memberId: member.id,
      userId: member.id,
      staffId: s.id,
      status,
      incidentDate: new Date(createdAt.getTime() - 1 * 24 * 60 * 60 * 1000),
      createdAt,
      updatedAt: now,
      assignedAt: now,
      assignedById: s.id,
      description: `Workload demo claim #${i + 1} for MK`,
      title: `Claim #${i + 1} - ${status}`,
      category: 'consumer_rights',
      companyName: 'Demo Company MK',
    });
  }

  if (claims.length > 0) {
    const chunks = chunkArray(claims, 20);
    for (const chunk of chunks) {
      await db.insert(schema.claims).values(chunk).onConflictDoNothing();
    }
  }
}

function chunkArray(array: any[], size: number) {
  const result = [];
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size));
  }
  return result;
}
