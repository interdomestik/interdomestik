import {
  E2E_USERS,
  and,
  auditLog,
  crmLeads,
  db,
  e2eEmail,
  eq,
  freeStartDrafts,
  session as authSession,
  user,
} from '@interdomestik/database';
import { expect, test, type Locator } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { fixtureLegalAcceptance } from '../fixtures/legal-acceptance.fixture';
import { routes } from '../routes';
import { openDeviceDetails, openSaveArea } from './public-save-options.fixture';
import { gotoApp } from '../utils/navigation';
import { S3_JOURNEY_INCIDENT_DATE } from './member-staff-evidence-journey-cleanup.fixture';
import { proveAbsentOtpRefusal } from './s5-absent-account-otp.fixture';
import { createOtpJourneyBrowser } from './s5-new-account-otp-browser.fixture';
import { cleanupOtpJourney, redactOtpFailure } from './s5-new-account-otp-cleanup.fixture';
import {
  OtpMail,
  enter,
  localCopy,
  mailboxConfigured,
  postOtpFromBrowser,
  requestOtpCode,
} from './s5-otp-mailbox.fixture';
import { idaOrigin, idaTarget } from './s5-saved-draft.fixture';
import {
  continueSavedDraftWithoutMembership,
  expectDraftTenantIsolation,
  expectNoDraftSideEffects,
} from './s5-draft-continuation.fixture';

// Traces, videos and screenshots would record the typed code, so this spec keeps none.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

test.describe('S5 door OTP secure save', () => {
  test('refuses an absent account and lets a verified account save, resume and delete a draft', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(testInfo.project.name !== 'gate-ks-sq', 'One canonical run owns the fixture.');
    const required = process.env.E2E_OTP_PROOF_REQUIRED === '1';
    if (required) expect(mailboxConfigured(), 'the lane provides the mail catcher').toBe(true);
    testInfo.skip(!mailboxConfigured(), 'Needs E2E_SMTP_HOST (loopback mail catcher).');
    test.setTimeout(240_000);
    const info = idaTarget(testInfo, 'ida.localhost');
    const tenant = E2E_USERS.KS_MEMBER.tenantId;
    const runId = `${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`;
    // The server keys OTP limits on a forwarded client address.
    const clientAddress = Date.now() % 250;
    const client = (offset = 0) => ({
      'x-forwarded-for': `203.0.113.${1 + ((clientAddress + offset) % 250)}`,
    });
    const email = e2eEmail(`s5-otp-${runId}`);
    const absentEmail = `s5-otp-absent-${runId}@interdomestik-e2e.test`;
    const ownerId = randomUUID();
    const fixtureMember = { id: ownerId, tenantId: tenant, email };
    const summary = `S5 secure save ${runId}.`;
    const counterparty = `S5 Insurer ${runId}`;
    const seen = new Set<string>();
    const mails: OtpMail[] = [];
    let failure: unknown;
    const userRow = (address = email) =>
      db.query.user.findFirst({ where: eq(user.email, address) });
    const drafts = async () => {
      const owner = await userRow();
      return owner
        ? db.query.freeStartDrafts.findMany({ where: eq(freeStartDrafts.ownerUserId, owner.id) })
        : [];
    };
    const { open, pages, browserAuthOrigins, browserAuthHeaderReads } = createOtpJourneyBrowser(
      browser,
      info.project.use.baseURL,
      client
    );
    const requestCode = (flow: Locator, openTestId?: string, address = email) =>
      requestOtpCode({ flow, email: address, seen, mails, openTestId });
    try {
      const start = await open();
      await gotoApp(start, routes.home('en'), info, { marker: 'free-start-intake-shell' });
      expect(
        await start.evaluate(() => ({ origin: location.origin, secure: isSecureContext }))
      ).toEqual({ origin: idaOrigin(info), secure: true });
      await start.getByTestId('cookie-consent-accept').click();
      const flow = start.getByTestId('premium-free-start-organizer');
      expect(await localCopy(start), 'browser recovery starts with no local copy').toBe(false);
      await openSaveArea(flow);
      expect(await localCopy(start), 'opening the save options writes nothing').toBe(false);
      await openDeviceDetails(flow);
      expect(await localCopy(start), 'reading device storage details writes nothing').toBe(false);
      await flow.getByTestId('browser-recovery-enable').click();
      await expect(flow).toHaveAttribute('data-save-behavior', 'device-recovery');
      await flow.getByTestId('free-start-category-vehicle').click();
      await flow.getByLabel('What happened?').selectOption('collision');
      await flow.getByLabel('When did it happen?').fill(S3_JOURNEY_INCIDENT_DATE);
      await flow.getByLabel('Who are you dealing with?').fill(counterparty);
      await flow.getByLabel('What do you want to recover?').selectOption('repair');
      await flow.getByLabel('Brief summary').fill(summary);
      await flow.getByRole('button', { name: 'Review your summary' }).click();
      await expect
        .poll(() => localCopy(start), { message: 'eligible facts are kept on this browser' })
        .toBe(true);
      expect(
        await userRow(absentEmail),
        'browser-only preparation creates no account'
      ).toBeUndefined();
      expect(
        await db.$count(crmLeads, eq(crmLeads.email, absentEmail)),
        'no CRM lead is created'
      ).toBe(0);

      const absentPanel = await proveAbsentOtpRefusal({
        browser,
        start,
        absentEmail,
        tenant,
        clientHeaders: client(),
        requestCode: () => requestCode(flow, 'free-start-save-open', absentEmail),
      });

      const now = new Date();
      await db.insert(user).values({
        ...fixtureMember,
        name: 'S5 verified fixture',
        role: 'member',
        emailVerified: true,
        tenantClassificationPending: true,
        createdAt: now,
        updatedAt: now,
      });
      await fixtureLegalAcceptance('seed', [fixtureMember]);
      await absentPanel.getByRole('button', { name: 'Use a different email', exact: true }).click();
      const { mail, panel } = await requestCode(flow);
      await test.step('a wrong code for an eligible account is refused and the browser copy is kept', async () => {
        await enter(
          panel.getByTestId('free-start-save-code'),
          mail.code === '000000' ? '111111' : '000000'
        );
        const [response] = await Promise.all([
          start.waitForResponse(
            response =>
              new URL(response.url()).pathname === '/api/auth/sign-in/email-otp' &&
              response.request().method() === 'POST'
          ),
          panel.getByTestId('free-start-save-verify').click(),
        ]);
        expect(response.status()).toBe(400);
        expect((await response.json()).code).toBe('INVALID_OTP');
        await expect(panel.locator('#free-start-save-error')).toBeVisible();
        expect(
          await db.$count(user, eq(user.email, email)),
          'the single eligible account remains'
        ).toBe(1);
        expect(
          (await start.context().cookies()).some(cookie => cookie.name.includes('session_token'))
        ).toBe(false);
        expect(await drafts(), 'a wrong code saves no draft').toEqual([]);
        expect(await localCopy(start), 'the browser copy survives a refused save').toBe(true);
      });
      const created =
        await test.step('a verified account uses its own code and saves', async () => {
          await enter(panel.getByTestId('free-start-save-code'), mail.code);
          await panel.getByTestId('free-start-save-verify').click();
          await expect(flow.getByTestId('free-start-save-status')).toHaveAttribute(
            'data-state',
            'saved'
          );
          await expect
            .poll(() => localCopy(start), {
              message: 'the browser copy is removed after a confirmed save',
            })
            .toBe(false);
          const owner = (await userRow())!;
          expect(owner).toMatchObject({
            id: ownerId,
            emailVerified: true,
            role: 'member',
            tenantId: tenant,
          });
          const sessionCookie = (await start.context().cookies()).find(cookie =>
            cookie.name.includes('session_token')
          );
          expect(sessionCookie, 'the browser receives a real session cookie').toMatchObject({
            httpOnly: true,
          });
          await Promise.all(browserAuthHeaderReads);
          expect(
            browserAuthOrigins.length,
            'native browser auth mutations were observed'
          ).toBeGreaterThan(0);
          expect(
            new Set(browserAuthOrigins),
            'the browser supplied only the trusted secure IDA origin'
          ).toEqual(new Set([idaOrigin(info)]));
          const saved = await drafts();
          expect(saved).toHaveLength(1);
          expect(saved[0]).toMatchObject({
            category: 'vehicle',
            counterparty,
            desiredOutcome: 'repair',
            incidentDate: S3_JOURNEY_INCIDENT_DATE,
            issueType: 'collision',
            resumeStep: 'preview',
            summary,
          });
          await expectNoDraftSideEffects(owner.id, email);
          return { draftId: saved[0]!.id, ownerId: owner.id };
        });

      await test.step('one-time-code replay fails closed on the trusted browser path', async () => {
        const sessions = () => db.$count(authSession, eq(authSession.userId, created.ownerId));
        const before = await sessions();
        expect(
          await postOtpFromBrowser(start, email, mail.code, tenant),
          'a consumed code is refused on the native trusted browser path'
        ).toBe(400);
        expect(await sessions(), 'the replay opens no session').toBe(before);
      });

      await test.step('the secure draft is isolated from a foreign tenant context', async () => {
        await expectDraftTenantIsolation(created.draftId, created.ownerId);
      });

      await test.step('a fresh session returns with a second real code and resumes', async () => {
        const fresh = await open();
        await gotoApp(fresh, routes.home('en'), info, { marker: 'free-start-intake-shell' });
        await fresh.getByTestId('cookie-consent-accept').click();
        expect(await localCopy(fresh), 'a fresh browser has no local copy').toBe(false);
        const again = fresh.getByTestId('premium-free-start-organizer');
        await openSaveArea(again);
        const second = await requestCode(again, 'free-start-manage-open');
        expect(second.mail.id).not.toBe(mail.id);
        await enter(second.panel.getByTestId('free-start-save-code'), second.mail.code);
        await second.panel.getByTestId('free-start-save-verify').click();
        const entry = again.getByTestId(`free-start-draft-${created.draftId}`);
        await expect(entry).toBeVisible();
        expect(await db.$count(user, eq(user.email, email)), 'the same single account').toBe(1);
        await entry.getByTestId(`free-start-resume-${created.draftId}`).click();
        for (const fact of [
          'Vehicle damage',
          'Collision damage',
          S3_JOURNEY_INCIDENT_DATE,
          counterparty,
          'Repair or replacement costs',
          summary,
        ])
          await expect(again).toContainText(fact);

        await test.step('continues the exact draft through the existing membership decision', async () => {
          await continueSavedDraftWithoutMembership(fresh, {
            origin: idaOrigin(info),
            draftId: created.draftId,
            counterparty,
            summary,
            reauthenticate: async () => {
              const recovery = await requestCode(fresh.getByTestId('saved-draft-sign-in'));
              await enter(recovery.panel.getByTestId('free-start-save-code'), recovery.mail.code);
              await recovery.panel.getByTestId('free-start-save-verify').click();
            },
          });
          await expectNoDraftSideEffects(created.ownerId, email);
          expect((await drafts()).map(draft => draft.id)).toEqual([created.draftId]);
          await gotoApp(fresh, routes.home('en'), info, { marker: 'free-start-intake-shell' });
        });

        await openSaveArea(again);
        await again.getByTestId('free-start-manage-open').click();
        await again.getByTestId(`free-start-delete-${created.draftId}`).click();
        await again.getByTestId('free-start-delete-confirm').click();
        await expect(again.getByTestId(`free-start-draft-${created.draftId}`)).toHaveCount(0);
        expect(await drafts(), 'the draft is permanently deleted').toEqual([]);
        const audit = await db.query.auditLog.findMany({
          columns: { action: true },
          where: and(eq(auditLog.tenantId, tenant), eq(auditLog.entityId, created.draftId)),
        });
        expect(audit.map(row => row.action)).toEqual(
          expect.arrayContaining(['free_start_draft.created', 'free_start_draft.deleted'])
        );
        await expectNoDraftSideEffects(created.ownerId, email);
      });
    } catch (error) {
      failure = await redactOtpFailure(error, mails, pages);
      throw failure;
    } finally {
      await cleanupOtpJourney({ absentEmail, fixtureMember, failure, pages, seen });
    }
  });
});
