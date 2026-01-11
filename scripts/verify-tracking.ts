import { db } from '@interdomestik/database';
import 'dotenv/config';
import { getMemberClaimDetail } from '../apps/web/src/features/claims/tracking/server/getMemberClaimDetail';
import { getPublicClaimStatus } from '../apps/web/src/features/claims/tracking/server/getPublicClaimStatus';

async function main() {
  console.log('--- Verifying Tracking Logic ---');

  const claimId = 'golden_ks_track_claim_001';
  const userId = 'golden_ks_member_tracking'; // member.tracking.ks
  const tenantId = 'tenant_ks';

  // 1. Verify Member Detail
  console.log(`\n1. Testing getMemberClaimDetail(${claimId}, ${userId})...`);
  const sessionUser = { id: userId, role: 'member' }; // mock session user
  const memberResult = await getMemberClaimDetail({ user: sessionUser }, claimId);

  if (memberResult) {
    console.log('✅ Member Detail Success:', memberResult.id, memberResult.title);
    console.log('Documents:', memberResult.documents.length);
    console.log('Timeline:', memberResult.timeline.length);
  } else {
    console.error('❌ Member Detail Failed (Returned null)');
  }

  // 2. Verify Public Token
  const token = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
  console.log(`\n2. Testing getPublicClaimStatus(${token})...`);
  const publicResult = await getPublicClaimStatus(token);

  if (publicResult) {
    console.log('✅ Public Status Success:', publicResult.id, publicResult.status);
  } else {
    console.error('❌ Public Status Failed (Returned null). DB might be missing token.');
    // Check if token exists in DB
    const dbToken = await db.query.claimTrackingTokens.findFirst({
      where: (t, { eq }) => eq(t.id, token),
    });
    console.log('   DB Token Check:', dbToken ? 'Exists' : 'Missing');
  }

  process.exit(0);
}

main().catch(console.error);
