import {
  E2E_USERS,
  and,
  db,
  domainEvents,
  eq,
  subscriptions,
  user,
  webhookEvents,
} from '@interdomestik/database';
import { createFreeStartDraft } from '@interdomestik/database/free-start-drafts';
import { expect, test, type Page } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import {
  S3_JOURNEY_INCIDENT_DATE,
  expectJourneyClean,
} from './member-staff-evidence-journey-cleanup.fixture';
import {
  cleanupS5,
  idaOrigin,
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
import {
  cleanupActivation,
  expectActivationClean,
  postKsWebhook,
} from './s6-provider-entitlement.fixture';

test.describe('S6 synthetic signed-event downstream continuation', () => {
  test('a verified member can submit the saved first case only after downstream signed-event processing', async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'gate-ks-sq', 'One canonical KS run owns activation.');
    test.setTimeout(240_000);
    const info = idaTarget(testInfo);
    const runId = randomUUID().replaceAll('-', '').slice(0, 12);
    const journey = {
      counterparty: `S6 Provider ${runId}`,
      summary: `S6 provider continuation ${runId}.`,
    };
    const eventId = `evt_s6_activation_${runId}`;
    const providerSubscriptionId = `sub_s6_activation_${runId}`;
    const owner = await ownerContext(E2E_USERS.KS_MEMBER_EMPTY);
    let claimId: string | null = null;
    let failure: unknown;
    let page: Page | null = null;
    let session: S5Session | null = null;

    try {
      const member = await db.query.user.findFirst({
        columns: { emailVerified: true, role: true },
        where: and(
          eq(user.id, owner.ownerUserId),
          eq(user.tenantId, owner.tenantId),
          eq(user.email, E2E_USERS.KS_MEMBER_EMPTY.email)
        ),
      });
      expect(member).toEqual({ emailVerified: true, role: 'member' });
      expect(
        await db.query.subscriptions.findFirst({
          columns: { id: true },
          where: and(
            eq(subscriptions.tenantId, owner.tenantId),
            eq(subscriptions.userId, owner.ownerUserId)
          ),
        }),
        'fixture starts without entitlement'
      ).toBeUndefined();

      const created = await createFreeStartDraft(owner, {
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

      page = await newPage(browser, info);
      session = await signIn(page, info, E2E_USERS.KS_MEMBER_EMPTY);
      const before = await openSavedDrafts(page, info);
      const entry = before.locator('li').filter({ hasText: journey.summary });
      await expect(entry).toHaveCount(1);
      await entry.getByTestId(/^free-start-resume-/).click();
      await expect(before.getByTestId('claim-draft-submit-disabled')).toBeDisabled();
      await expect(
        before.getByText(
          'To submit a claim, you need an active membership. You can keep managing this saved draft; saving it does not submit the claim.'
        )
      ).toBeVisible();
      expect(await journeyClaims(journey), 'browser state creates no entitlement or claim').toEqual(
        []
      );

      const startsAt = new Date().toISOString();
      const endsAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
      const payload = {
        event_id: eventId,
        event_type: 'subscription.updated',
        occurred_at: startsAt,
        data: {
          id: providerSubscriptionId,
          status: 'active',
          customer_id: `ctm_s6_${runId}`,
          custom_data: { tenantId: owner.tenantId, userId: owner.ownerUserId },
          items: [{ price: { id: 'standard' }, quantity: 1 }],
          current_billing_period: { starts_at: startsAt, ends_at: endsAt },
        },
      };

      const activation = await postKsWebhook(page, idaOrigin(info), payload);
      expect(activation.status(), await activation.text()).toBe(200);
      expect(await activation.json()).toEqual({ success: true });

      const replay = await postKsWebhook(page, idaOrigin(info), payload);
      expect(replay.status(), await replay.text()).toBe(200);
      expect(await replay.json()).toEqual({ success: true, duplicate: true });

      const membership = await db.query.subscriptions.findMany({
        columns: {
          id: true,
          planId: true,
          providerSubscriptionId: true,
          status: true,
          tenantId: true,
          userId: true,
        },
        where: and(
          eq(subscriptions.tenantId, owner.tenantId),
          eq(subscriptions.userId, owner.ownerUserId)
        ),
      });
      expect(membership).toEqual([
        {
          id: providerSubscriptionId,
          planId: 'standard',
          providerSubscriptionId,
          status: 'active',
          tenantId: owner.tenantId,
          userId: owner.ownerUserId,
        },
      ]);
      const receipt = await db.query.webhookEvents.findMany({
        columns: {
          eventId: true,
          processingResult: true,
          processingScopeKey: true,
          signatureValid: true,
        },
        where: and(
          eq(webhookEvents.provider, 'paddle'),
          eq(webhookEvents.processingScopeKey, 'entity:ks'),
          eq(webhookEvents.eventId, eventId)
        ),
      });
      expect(receipt).toEqual([
        {
          eventId,
          processingResult: 'ok',
          processingScopeKey: 'entity:ks',
          signatureValid: true,
        },
      ]);
      expect(
        await db.query.domainEvents.findMany({
          columns: { eventName: true, id: true },
          where: and(
            eq(domainEvents.tenantId, owner.tenantId),
            eq(domainEvents.entityId, providerSubscriptionId)
          ),
        })
      ).toEqual([
        {
          eventName: 'membership.subscription_changed',
          id: `paddle:${owner.tenantId}:${eventId}:subscription-changed`,
        },
      ]);

      const after = await openSavedDrafts(page, info);
      await after
        .locator('li')
        .filter({ hasText: journey.summary })
        .getByTestId(/^free-start-resume-/)
        .click();
      const submit = after.getByTestId('claim-draft-submit');
      await expect(submit).toBeEnabled();
      await submit.click();
      await expect(after.getByTestId('claim-created-success')).toBeVisible();
      const claims = await journeyClaims(journey);
      expect(claims).toEqual([{ id: expect.any(String), userId: owner.ownerUserId }]);
      claimId = claims[0]!.id;
    } catch (error) {
      failure = error;
      throw error;
    } finally {
      const activeSession = session;
      const activePage = page;
      await teardown(
        [
          () => cleanupS5(claimId, journey),
          ...(activeSession ? [() => signOut(activeSession)] : []),
          ...(activePage ? [() => activePage.context().close()] : []),
          () =>
            cleanupActivation({
              eventId,
              providerSubscriptionId,
              tenantId: owner.tenantId,
              userId: owner.ownerUserId,
            }),
          () => expectJourneyClean(claimId, journey),
          () =>
            expectActivationClean({
              eventId,
              providerSubscriptionId,
              tenantId: owner.tenantId,
              userId: owner.ownerUserId,
            }),
        ],
        failure
      );
    }
  });
});
