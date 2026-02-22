import {
  E2E_USERS,
  and,
  claimDocuments,
  claimStageHistory,
  claims,
  db,
  eq,
  user,
} from '@interdomestik/database';
import { cancelClaimCore, updateDraftClaimCore } from '@interdomestik/domain-claims/claims/draft';
import { assignClaimCore as assignStaffClaimCore } from '@interdomestik/domain-claims/staff-claims/assign';
import { updateClaimStatusCore as updateStaffClaimStatusCore } from '@interdomestik/domain-claims/staff-claims/update-status';
import { expect, test } from '../fixtures/auth.fixture';

const ACTOR_HOST = process.env.C2_ACTOR_HOST ?? process.env.MK_HOST ?? 'mk.127.0.0.1.nip.io:3000';
const ACTOR_STAFF_EMAIL = process.env.C2_STAFF_EMAIL ?? E2E_USERS.MK_STAFF.email;
const ACTOR_MEMBER_EMAIL = process.env.C2_MEMBER_EMAIL ?? E2E_USERS.MK_MEMBER.email;
const ACTOR_STAFF_TENANT_ID = process.env.C2_STAFF_TENANT_ID ?? E2E_USERS.MK_STAFF.tenantId;
const ACTOR_MEMBER_TENANT_ID = process.env.C2_MEMBER_TENANT_ID ?? E2E_USERS.MK_MEMBER.tenantId;
const TARGET_TENANT_ID = process.env.C2_TARGET_TENANT_ID ?? E2E_USERS.KS_MEMBER.tenantId;

type StaffSession = {
  user: {
    id: string;
    role: string | null;
    tenantId: string | null;
    branchId: string | null;
  };
};

type MemberSession = {
  user: {
    id: string;
    role: string | null;
    tenantId: string | null;
  };
};

type KsClaimTarget = {
  id: string;
  title: string;
  status: string | null;
  staffId: string | null;
};

async function findKsMutableClaim(): Promise<KsClaimTarget> {
  const ksClaims = await db.query.claims.findMany({
    where: eq(claims.tenantId, TARGET_TENANT_ID),
    columns: { id: true, title: true, status: true, staffId: true },
    orderBy: (table, { desc }) => [desc(table.createdAt), desc(table.id)],
    limit: 80,
  });

  if (ksClaims.length === 0) {
    throw new Error('Expected seeded KS claims to exist');
  }

  const preferred = ksClaims.find(
    claim => claim.staffId == null && claim.status !== 'resolved' && claim.status !== 'rejected'
  );
  const fallback = ksClaims.find(
    claim => claim.status !== 'resolved' && claim.status !== 'rejected'
  );

  return preferred ?? fallback ?? ksClaims[0];
}

test.describe.configure({ mode: 'serial' });

test('C2-04: staff/member cross-tenant writes are denied without mutation', async () => {
  const targetClaim = await findKsMutableClaim();

  const mkStaff = await db.query.user.findFirst({
    where: and(eq(user.email, ACTOR_STAFF_EMAIL), eq(user.tenantId, ACTOR_STAFF_TENANT_ID)),
    columns: { id: true, role: true, tenantId: true, branchId: true },
  });
  if (!mkStaff?.id || mkStaff.tenantId !== ACTOR_STAFF_TENANT_ID) {
    throw new Error('Expected seeded MK staff actor');
  }

  const mkMember = await db.query.user.findFirst({
    where: and(eq(user.email, ACTOR_MEMBER_EMAIL), eq(user.tenantId, ACTOR_MEMBER_TENANT_ID)),
    columns: { id: true, role: true, tenantId: true },
  });
  if (!mkMember?.id || mkMember.tenantId !== ACTOR_MEMBER_TENANT_ID) {
    throw new Error('Expected seeded MK member actor');
  }

  const staffSession = {
    user: {
      id: mkStaff.id,
      role: mkStaff.role,
      tenantId: mkStaff.tenantId,
      branchId: mkStaff.branchId ?? null,
    },
  } satisfies StaffSession;

  const memberSession = {
    user: {
      id: mkMember.id,
      role: mkMember.role,
      tenantId: mkMember.tenantId,
    },
  } satisfies MemberSession;

  const baseline = await db.query.claims.findFirst({
    where: and(eq(claims.id, targetClaim.id), eq(claims.tenantId, TARGET_TENANT_ID)),
    columns: { title: true, status: true, staffId: true },
  });

  if (!baseline) {
    throw new Error(`Expected baseline KS claim ${targetClaim.id}`);
  }

  const assignResult = await assignStaffClaimCore({
    claimId: targetClaim.id,
    session: staffSession,
    requestHeaders: new Headers({ 'x-forwarded-host': ACTOR_HOST }),
  });
  expect(assignResult.success).toBe(false);
  if (assignResult.success) {
    throw new Error('Expected cross-tenant staff assignment to be denied');
  }
  expect(assignResult.error).toBe('Claim not found or access denied');

  const statusProbeNote = `C2-04 cross-tenant staff status probe ${Date.now()}`;
  const staffStatusResult = await updateStaffClaimStatusCore({
    claimId: targetClaim.id,
    newStatus: 'verification',
    note: statusProbeNote,
    isPublicChange: false,
    session: staffSession,
    requestHeaders: new Headers({ 'x-forwarded-host': ACTOR_HOST }),
  });

  expect(staffStatusResult.success).toBe(false);
  if (staffStatusResult.success) {
    throw new Error('Expected cross-tenant staff status update to be denied');
  }
  expect(staffStatusResult.error).toBe('Claim not found');

  const memberCancelResult = await cancelClaimCore({
    session: memberSession,
    requestHeaders: new Headers({ 'x-forwarded-host': ACTOR_HOST }),
    claimId: targetClaim.id,
  });

  expect(memberCancelResult.success).toBe(false);
  expect(memberCancelResult.error).toBe('Claim not found');

  const draftProbeFileName = `c2-04-draft-probe-${Date.now()}.pdf`;
  const memberDraftResult = await updateDraftClaimCore({
    session: memberSession,
    requestHeaders: new Headers({ 'x-forwarded-host': ACTOR_HOST }),
    claimId: targetClaim.id,
    data: {
      category: 'vehicle',
      title: 'C2-04 cross tenant draft probe title',
      companyName: 'Probe Company',
      description: 'This payload verifies that cross-tenant draft updates are denied.',
      claimAmount: '999',
      currency: 'EUR',
      files: [
        {
          id: `c2-04-file-${Date.now()}`,
          name: draftProbeFileName,
          path: `pii/tenants/${TARGET_TENANT_ID}/claims/probe/${draftProbeFileName}`,
          type: 'application/pdf',
          size: 1024,
          bucket: 'claim-evidence',
          classification: 'pii',
        },
      ],
    },
  });

  expect(memberDraftResult.success).toBe(false);
  expect(memberDraftResult.error).toBe('Claim not found');

  const persistedClaim = await db.query.claims.findFirst({
    where: and(eq(claims.id, targetClaim.id), eq(claims.tenantId, TARGET_TENANT_ID)),
    columns: { title: true, status: true, staffId: true },
  });

  expect(persistedClaim?.title).toBe(baseline.title);
  expect(persistedClaim?.status ?? null).toBe(baseline.status ?? null);
  expect(persistedClaim?.staffId ?? null).toBe(baseline.staffId ?? null);

  const persistedStatusProbe = await db.query.claimStageHistory.findFirst({
    where: and(
      eq(claimStageHistory.claimId, targetClaim.id),
      eq(claimStageHistory.tenantId, TARGET_TENANT_ID),
      eq(claimStageHistory.note, statusProbeNote)
    ),
    columns: { id: true },
  });
  expect(persistedStatusProbe).toBeUndefined();

  const persistedDraftProbeDocument = await db.query.claimDocuments.findFirst({
    where: and(
      eq(claimDocuments.claimId, targetClaim.id),
      eq(claimDocuments.tenantId, TARGET_TENANT_ID),
      eq(claimDocuments.name, draftProbeFileName)
    ),
    columns: { id: true },
  });
  expect(persistedDraftProbeDocument).toBeUndefined();

  console.log('MARKER_C2_04_STAFF_ASSIGN_DENIED');
  console.log('MARKER_C2_04_STAFF_STATUS_DENIED');
  console.log('MARKER_C2_04_MEMBER_CANCEL_DENIED');
  console.log('MARKER_C2_04_MEMBER_DRAFT_DENIED');
  console.log(`C2_04_TARGET_CLAIM_ID=${targetClaim.id}`);
  console.log(`C2_04_TARGET_CLAIM_TITLE=${targetClaim.title}`);
});
