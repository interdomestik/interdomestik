import { randomUUID } from 'node:crypto';
import { E2E_USER_IDS, type E2EUserKey } from '@interdomestik/database';
import { expect, directDoorUpload, loginAtDoor } from '../fixtures/one-door.fixture';
import {
  test,
  pdf,
  signedPdf,
  evidenceState,
  assertDoorDocument,
  expectDeniedSigning,
} from '../fixtures/one-door-upload.fixture';
import { createDoorClaim, removeDoorClaim } from '../fixtures/one-door-data.fixture';

const roster = [
  { admin: 'KS_ADMIN', member: 'KS_MEMBER', tenantId: 'tenant_ks', locale: 'sq' },
  { admin: 'MK_ADMIN', member: 'MK_MEMBER', tenantId: 'tenant_mk', locale: 'mk' },
  { admin: 'PILOT_MK_ADMIN', member: 'PILOT_MK_MEMBER', tenantId: 'pilot-mk', locale: 'en' },
] as const;
const eml = Buffer.from(
  'From: synthetic@example.invalid\r\nSubject: One door\r\n\r\nSynthetic evidence.\r\n'
);

test.describe('one-door admin evidence dependencies', () => {
  roster.forEach(({ admin, member, tenantId, locale }) => {
    test(`${tenantId}: native session, signed PDF metadata/ownership and direct EML API outcome`, async ({
      door,
      doorStorage,
    }, info) => {
      const claim = await createDoorClaim(member);
      try {
        await loginAtDoor(door.page, door.origin, locale, admin, info);
        const pdfName = `door-${randomUUID()}.pdf`;
        await signedPdf(door.page, door.origin, locale, claim, pdfName, info);
        await assertDoorDocument(claim, pdfName, admin, pdf, doorStorage);
        const beforeDirect = await evidenceState(claim, doorStorage);
        const emlName = `door-${randomUUID()}.eml`;
        const response = await directDoorUpload(door.page, door.origin, claim.id, emlName, eml);
        if (doorStorage === 'real-storage') {
          expect(response.status()).toBe(200);
          const document = await assertDoorDocument(claim, emlName, admin, eml, doorStorage);
          expect(document.tenantId).toBe(tenantId);
          expect(document.uploadedBy).toBe(E2E_USER_IDS[admin]);
        } else {
          // Direct API has no fake upload implementation: assert its failure without claiming stored-byte proof.
          expect(response.status()).toBe(500);
          expect(await evidenceState(claim, doorStorage)).toEqual(beforeDirect);
        }
      } finally {
        await removeDoorClaim(claim, doorStorage === 'real-storage');
      }
    });
    roster
      .filter(target => target.tenantId !== tenantId)
      .forEach(target => {
        test(`${tenantId} denies upload to ${target.tenantId} without metadata effects (and without objects when storage is configured)`, async ({
          door,
          doorStorage,
        }, info) => {
          const claim = await createDoorClaim(target.member);
          const control = await createDoorClaim(member);
          try {
            await loginAtDoor(door.page, door.origin, locale, admin, info);
            const signing = await signedPdf(
              door.page,
              door.origin,
              locale,
              control,
              'control.pdf',
              info
            );
            await assertDoorDocument(control, 'control.pdf', admin, pdf, doorStorage);
            const before = await evidenceState(claim, doorStorage);
            await door.page
              .context()
              .addCookies([{ name: 'tenantId', value: target.tenantId, url: door.origin }]);
            const response = await directDoorUpload(
              door.page,
              door.origin,
              claim.id,
              'foreign.eml',
              eml,
              { 'x-tenant-id': target.tenantId }
            );
            expect([403, 404]).toContain(response.status());
            await expectDeniedSigning(
              door.page,
              door.origin,
              signing,
              control,
              claim,
              'Claim not found'
            );
            expect(await evidenceState(claim, doorStorage)).toEqual(before);
            const session = await door.page.request.get(`${door.origin}/api/auth/get-session`);
            expect((await session.json()).user).toMatchObject({
              id: E2E_USER_IDS[admin],
              tenantId,
            });
          } finally {
            await Promise.all([
              removeDoorClaim(claim, doorStorage === 'real-storage'),
              removeDoorClaim(control, doorStorage === 'real-storage'),
            ]);
          }
        });
      });
  });

  const accessCases: readonly {
    actor: E2EUserKey;
    member: E2EUserKey;
    branchId: string;
    staffId: string | null;
    allowed: boolean;
    draft?: boolean;
    label: string;
  }[] = [
    {
      actor: 'KS_STAFF',
      member: 'KS_MEMBER',
      branchId: 'ks_branch_a',
      staffId: null,
      allowed: true,
      label: 'same branch',
    },
    {
      actor: 'KS_STAFF',
      member: 'KS_MEMBER_B1',
      branchId: 'ks_branch_b',
      staffId: E2E_USER_IDS.KS_STAFF,
      allowed: true,
      label: 'assigned across branch',
    },
    {
      actor: 'KS_STAFF',
      member: 'KS_MEMBER_B1',
      branchId: 'ks_branch_b',
      staffId: null,
      allowed: false,
      label: 'other branch unassigned',
    },
    {
      actor: 'KS_STAFF',
      member: 'KS_MEMBER',
      branchId: 'ks_branch_a',
      staffId: E2E_USER_IDS.KS_STAFF,
      allowed: false,
      draft: true,
      label: 'member draft',
    },
    {
      actor: 'KS_BRANCH_MANAGER',
      member: 'KS_MEMBER',
      branchId: 'ks_branch_a',
      staffId: null,
      allowed: false,
      label: 'manager denied',
    },
    {
      actor: 'KS_MEMBER',
      member: 'KS_MEMBER',
      branchId: 'ks_branch_a',
      staffId: null,
      allowed: true,
      label: 'member owns claim',
    },
    {
      actor: 'KS_MEMBER',
      member: 'KS_MEMBER_A2',
      branchId: 'ks_branch_a',
      staffId: null,
      allowed: false,
      label: 'other member owner',
    },
  ];
  accessCases.forEach(({ actor, member, branchId, staffId, allowed, draft, label }) => {
    test(`IDA role scope: ${label}`, async ({ door, doorStorage }, info) => {
      const claim = await createDoorClaim(member, {
        branchId,
        staffId,
        caseLifecycleState: draft ? 'draft' : 'submitted',
      });
      const control = allowed ? null : await createDoorClaim('KS_MEMBER');
      try {
        let signing;
        if (control) {
          await loginAtDoor(door.page, door.origin, 'sq', 'KS_ADMIN', info);
          signing = await signedPdf(door.page, door.origin, 'sq', control, 'control.pdf', info);
          await assertDoorDocument(control, 'control.pdf', 'KS_ADMIN', pdf, doorStorage);
          await door.page.context().clearCookies();
        }
        await loginAtDoor(door.page, door.origin, 'sq', actor, info);
        const before = await evidenceState(claim, doorStorage);
        const response = await directDoorUpload(door.page, door.origin, claim.id, 'scope.eml', eml);
        if (allowed) {
          if (doorStorage === 'real-storage') {
            expect(response.status()).toBe(200);
            await assertDoorDocument(claim, 'scope.eml', actor, eml, doorStorage);
          } else {
            expect(response.status()).toBe(500);
            expect(await evidenceState(claim, doorStorage)).toEqual(before);
          }
        } else {
          expect([403, 404]).toContain(response.status());
          if (!control || !signing) throw new Error('Missing native signing control');
          await expectDeniedSigning(
            door.page,
            door.origin,
            signing,
            control,
            claim,
            actor === 'KS_BRANCH_MANAGER' || actor === 'KS_MEMBER'
              ? 'Unauthorized'
              : 'Claim not found'
          );
          expect(await evidenceState(claim, doorStorage)).toEqual(before);
        }
      } finally {
        await Promise.all([
          removeDoorClaim(claim, doorStorage === 'real-storage'),
          ...(control ? [removeDoorClaim(control, doorStorage === 'real-storage')] : []),
        ]);
      }
    });
  });
});
