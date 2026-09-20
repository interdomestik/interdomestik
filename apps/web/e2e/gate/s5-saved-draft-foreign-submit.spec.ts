import { E2E_USERS, and, claims, db, eq, subscriptions } from '@interdomestik/database';
import {
  createFreeStartDraft,
  resumeFreeStartDraft,
  type FreeStartDraft,
  type FreeStartDraftContext,
} from '@interdomestik/database/free-start-drafts';
import { expect, test, type Page } from '@playwright/test';
import { createHash, randomUUID } from 'node:crypto';
import {
  S3_JOURNEY_INCIDENT_DATE,
  expectJourneyClean,
  type S3JourneyIdentity,
} from './member-staff-evidence-journey-cleanup.fixture';
import {
  KS_MEMBER_A2,
  cleanupS5,
  idaTarget,
  journeyClaims,
  newPage,
  openSavedDrafts,
  ownerContext,
  signIn,
  signOut,
  teardown,
  type S5Session,
} from './s5-saved-draft.fixture';

async function previewDraft(context: FreeStartDraftContext, journey: S3JourneyIdentity) {
  const created = await createFreeStartDraft(context, {
    category: 'vehicle',
    clientRequestId: randomUUID(),
    counterparty: journey.counterparty,
    desiredOutcome: 'repair',
    incidentDate: S3_JOURNEY_INCIDENT_DATE,
    issueType: 'collision',
    resumeStep: 'preview',
    summary: journey.summary,
  });
  if (!created.ok) throw new Error(`draft seed failed: ${created.code}`);
  return created.draft;
}

// Mirrors the server's deterministic saved-draft claim identity.
function savedDraftClaimId(context: FreeStartDraftContext, draftId: string) {
  const key = JSON.stringify([context.tenantId, context.ownerUserId, draftId]);
  return `fsd_${createHash('sha256').update(key).digest('hex')}`;
}

async function claimExists(id: string) {
  const row = await db.query.claims.findFirst({
    columns: { id: true },
    where: and(eq(claims.id, id), eq(claims.tenantId, E2E_USERS.KS_MEMBER.tenantId)),
  });
  return Boolean(row);
}

// Rewrites only the submit action (it alone carries expectedVersion) to the other draft id.
async function forgeSubmit(page: Page, from: FreeStartDraft, to: FreeStartDraft) {
  const forged: string[] = [];
  await page.route('**/*', async route => {
    const request = route.request();
    const body = request.postData() ?? '';
    const isSubmit = Boolean(request.headers()['next-action']) && body.includes('expectedVersion');
    if (request.method() !== 'POST' || !isSubmit) return route.fallback();
    const postData = body.replace(from.id, to.id);
    forged.push(postData);
    await route.continue({ postData });
  });
  return forged;
}

test.describe('S5 saved-draft foreign submission', () => {
  test('another active member cannot submit the owner draft by its real id', async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'gate-ks-sq', 'One canonical run owns the drafts.');
    test.setTimeout(180_000);
    const info = idaTarget(testInfo);
    const runId = `${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`;
    const target = { counterparty: `S5 Owner ${runId}`, summary: `S5 foreign target ${runId}.` };
    const own = { counterparty: `S5 Actor ${runId}`, summary: `S5 foreign actor ${runId}.` };
    const owner = await ownerContext(E2E_USERS.KS_MEMBER);
    const actor = await ownerContext(KS_MEMBER_A2);
    const membership = await db.query.subscriptions.findFirst({
      columns: { status: true },
      where: and(
        eq(subscriptions.tenantId, actor.tenantId),
        eq(subscriptions.userId, actor.ownerUserId),
        eq(subscriptions.status, 'active')
      ),
    });
    expect(membership, 'the foreign actor is an active member').toBeTruthy();
    let session: S5Session | null = null;
    let page: Page | null = null;
    let actorClaimId: string | null = null;
    let failure: unknown;
    try {
      const targetDraft = await previewDraft(owner, target);
      const actorDraft = await previewDraft(actor, own);
      expect(actorDraft.version, 'only the id is forged').toBe(targetDraft.version);
      expect(await resumeFreeStartDraft(actor, targetDraft.id)).toEqual({
        ok: false,
        code: 'notFound',
      });

      page = await newPage(browser, info);
      session = await signIn(page, info, KS_MEMBER_A2);
      const intake = await openSavedDrafts(page, info);
      await intake
        .locator('li')
        .filter({ hasText: own.summary })
        .getByTestId(/^free-start-resume-/)
        .click();
      const submit = intake.getByTestId('claim-draft-submit');
      await expect(submit).toBeEnabled();

      await test.step('submit forged with the owner draft id is refused', async () => {
        const forged = await forgeSubmit(page!, actorDraft, targetDraft);
        const response = page!.waitForResponse(
          r => r.request().method() === 'POST' && r.request().postData() === forged[0]
        );
        await submit.click();
        const refused = await response;
        expect(forged).toHaveLength(1);
        expect(forged[0]).toContain(targetDraft.id);
        expect(forged[0]).not.toContain(actorDraft.id);
        expect(await refused.text()).toContain('Claim submission unavailable.');
        await expect(intake.getByRole('alert')).toBeVisible();
        await expect(intake.getByTestId('claim-created-success')).toHaveCount(0);
        await page!.unrouteAll({ behavior: 'wait' });
      });

      expect(await journeyClaims(target), 'no claim from the owner facts').toEqual([]);
      expect(await claimExists(savedDraftClaimId(actor, targetDraft.id))).toBe(false);
      expect(await claimExists(savedDraftClaimId(owner, targetDraft.id))).toBe(false);
      expect(await resumeFreeStartDraft(owner, targetDraft.id)).toEqual({
        ok: true,
        draft: targetDraft,
      });

      await test.step('the same active member can submit its own draft', async () => {
        await submit.click();
        await expect(intake.getByTestId('claim-created-success')).toBeVisible();
        const created = await journeyClaims(own);
        expect(created).toEqual([
          { id: savedDraftClaimId(actor, actorDraft.id), userId: actor.ownerUserId },
        ]);
        actorClaimId = created[0]!.id;
      });
      expect(await journeyClaims(target), 'owner facts still unclaimed').toEqual([]);
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      const signedIn = session;
      const opened = page;
      await teardown(
        [
          () => cleanupS5(null, target),
          () => cleanupS5(actorClaimId, own),
          ...(signedIn ? [() => signOut(signedIn)] : []),
          ...(opened ? [() => opened.context().close()] : []),
          () => expectJourneyClean(null, target),
          () => expectJourneyClean(actorClaimId, own),
        ],
        failure
      );
    }
  });
});
