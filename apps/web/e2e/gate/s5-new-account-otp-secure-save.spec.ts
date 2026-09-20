import {
  E2E_USERS,
  and,
  auditLog,
  db,
  eq,
  freeStartDrafts,
  inArray,
  or,
  session as authSession,
  sql,
  user,
} from '@interdomestik/database';
import { expect, test, type Locator, type Page } from '@playwright/test';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { S3_JOURNEY_INCIDENT_DATE } from './member-staff-evidence-journey-cleanup.fixture';
import {
  OtpMail,
  changedTables,
  deleteMail,
  enter,
  localCopy,
  mailboxConfigured,
  redact,
  tableCounts,
  waitForOtpMail,
} from './s5-otp-mailbox.fixture';
import { idaOrigin, idaTarget, teardown } from './s5-saved-draft.fixture';

// Traces, videos and screenshots would record the typed code, so this spec keeps none.
test.use({ screenshot: 'off', trace: 'off', video: 'off' });

const SUBJECT = 'Your email confirmation code';
// Rows a new account may add; anything else would be a business record.
const SAVED = { audit_log: 1, free_start_drafts: 1, session: 1, user: 1 };
const RETURNED = { audit_log: 3, session: 2, user: 1 };

test.describe('S5 new-account email OTP secure save', () => {
  test('a new person verifies an email, saves, returns in a fresh session and deletes the draft', async ({
    browser,
  }, testInfo) => {
    testInfo.skip(testInfo.project.name !== 'gate-ks-sq', 'One canonical run creates the account.');
    const required = process.env.E2E_OTP_PROOF_REQUIRED === '1';
    if (required) expect(mailboxConfigured(), 'the lane provides the mail catcher').toBe(true);
    testInfo.skip(!mailboxConfigured(), 'Needs E2E_SMTP_HOST (loopback mail catcher).');
    test.setTimeout(240_000);
    const info = idaTarget(testInfo, 'ida.localhost');
    const tenant = E2E_USERS.KS_MEMBER.tenantId;
    const runId = `${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`;
    // The server keys OTP limits on a forwarded client address.
    const CLIENT = { 'x-forwarded-for': `203.0.113.${1 + (Date.now() % 250)}` };
    const email = `s5-otp-${runId}@interdomestik-e2e.test`;
    const summary = `S5 new account ${runId}.`;
    const counterparty = `S5 Insurer ${runId}`;
    const seen = new Set<string>();
    const mails: OtpMail[] = [];
    const pages: Page[] = [];
    let failure: unknown;
    let baseline = new Map<string, number>();
    const dayZero = await tableCounts();
    baseline = dayZero;
    const userRow = () => db.query.user.findFirst({ where: eq(user.email, email) });
    const drafts = async () => {
      const owner = await userRow();
      return owner
        ? db.query.freeStartDrafts.findMany({ where: eq(freeStartDrafts.ownerUserId, owner.id) })
        : [];
    };
    const open = async () => {
      const context = await browser.newContext({
        baseURL: info.project.use.baseURL,
        extraHTTPHeaders: CLIENT,
        storageState: { cookies: [], origins: [] },
      });
      // The browser-local copy needs a secure context (ida.localhost), which the server's trusted
      // origins omit; the browser will not let a route change Origin, so refetch with the trusted one.
      await context.route('**/api/auth/**', async route => {
        const origin = process.env.BETTER_AUTH_URL?.trim() || idaOrigin(info);
        const response = await route.fetch({ headers: { ...route.request().headers(), origin } });
        await route.fulfill({ response });
      });
      const page = await context.newPage();
      pages.push(page);
      return page;
    };
    const requestCode = async (flow: Locator, openTestId: string) => {
      await flow.getByTestId(openTestId).click();
      const panel = flow.getByTestId('free-start-save-otp');
      await panel.getByTestId('free-start-save-email').fill(email);
      await panel.getByTestId('free-start-save-send-code').click();
      const mail = await waitForOtpMail(email, seen);
      mails.push(mail);
      await expect(panel.getByTestId('free-start-save-code')).toBeVisible();
      return { mail, panel };
    };
    try {
      const start = await open();
      await gotoApp(start, routes.home('en'), info, { marker: 'free-start-intake-shell' });
      await start.getByTestId('cookie-consent-accept').click();
      const flow = start.getByTestId('premium-free-start-organizer');
      await flow.getByTestId('free-start-category-vehicle').click();
      await flow.getByRole('button', { name: 'Continue to guided intake' }).click();
      await flow.getByLabel('What happened?').selectOption('collision');
      await flow.getByLabel('When did it happen?').fill(S3_JOURNEY_INCIDENT_DATE);
      await flow.getByLabel('Who are you dealing with?').fill(counterparty);
      await flow.getByLabel('What do you want to recover?').selectOption('repair');
      await flow.getByLabel('Brief summary').fill(summary);
      await flow.getByRole('button', { name: 'Review your summary' }).click();
      await expect
        .poll(() => localCopy(start), { message: 'eligible facts are kept on this browser' })
        .toBe(true);
      baseline = await tableCounts();
      expect(
        changedTables(dayZero, baseline),
        'browser-only preparation writes no server row'
      ).toEqual({});

      const { mail, panel } =
        await test.step('a real code is delivered and stored hashed', async () => {
          const sent = await requestCode(flow, 'free-start-save-open');
          expect(sent.mail.subject, 'subject is the static neutral text').toBe(SUBJECT);
          expect(sent.mail.to).toBe(email);
          expect(
            changedTables(baseline, await tableCounts()),
            'only the pending code is recorded'
          ).toEqual({ verification: 1 });
          expect(await userRow(), 'no account exists before verification').toBeUndefined();
          const stored = await db.execute<{ value: string }>(
            sql`select value from verification where identifier like ${`%${email}`}`
          );
          expect(stored, 'one pending code').toHaveLength(1);
          expect(stored[0]!.value.includes(sent.mail.code), 'the code is not stored in clear').toBe(
            false
          );
          return sent;
        });

      await test.step('a wrong code is refused and the browser copy is kept', async () => {
        await enter(
          panel.getByTestId('free-start-save-code'),
          mail.code === '000000' ? '111111' : '000000'
        );
        await panel.getByTestId('free-start-save-verify').click();
        await expect(panel.locator('#free-start-save-error')).toBeVisible();
        expect(await userRow(), 'a wrong code creates no account').toBeUndefined();
        expect(await localCopy(start), 'the browser copy survives a refused save').toBe(true);
      });

      const created = await test.step('the right code creates the account and saves', async () => {
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
        expect(owner).toMatchObject({ emailVerified: true, role: 'member', tenantId: tenant });
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
        expect(
          changedTables(baseline, await tableCounts()),
          'only account, session, draft and audit rows'
        ).toEqual(SAVED);
        return { draftId: saved[0]!.id, ownerId: owner.id };
      });

      await test.step('the used code cannot be replayed', async () => {
        const sessions = () => db.$count(authSession, eq(authSession.userId, created.ownerId));
        const before = await sessions();
        const replay = await start.request.post(`${idaOrigin(info)}/api/auth/sign-in/email-otp`, {
          data: { email, onboarding: { mode: 'deferred', tenant }, otp: mail.code },
          failOnStatusCode: false,
          headers: {
            ...CLIENT,
            Origin: process.env.BETTER_AUTH_URL?.trim() || idaOrigin(info),
            'x-tenant-id': tenant,
          },
        });
        expect(replay.status(), 'a consumed code is refused as invalid').toBe(400);
        expect(await sessions(), 'the replay opens no session').toBe(before);
      });

      await test.step('a fresh session returns with a second real code and resumes', async () => {
        const fresh = await open();
        await gotoApp(fresh, routes.home('en'), info, { marker: 'free-start-intake-shell' });
        await fresh.getByTestId('cookie-consent-accept').click();
        expect(await localCopy(fresh), 'a fresh browser has no local copy').toBe(false);
        const again = fresh.getByTestId('premium-free-start-organizer');
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
        expect(
          changedTables(baseline, await tableCounts()),
          'resume and delete add only sessions and audit'
        ).toEqual(RETURNED);
      });
    } catch (error) {
      failure = redact(error, mails);
      await Promise.all(
        pages.map(page =>
          page
            .locator('input')
            .evaluateAll(inputs =>
              inputs.forEach(input => ((input as HTMLInputElement).value = ''))
            )
            .catch(() => undefined)
        )
      );
      throw failure;
    } finally {
      const owner = await userRow().catch(() => undefined);
      await teardown(
        [
          async () => {
            if (!owner) return;
            const ids = (
              await db.query.freeStartDrafts.findMany({
                columns: { id: true },
                where: eq(freeStartDrafts.ownerUserId, owner.id),
              })
            ).map(row => row.id);
            const audit = or(
              eq(auditLog.actorId, owner.id),
              ids.length ? inArray(auditLog.entityId, ids) : undefined
            );
            await db.delete(auditLog).where(audit);
            await db.delete(freeStartDrafts).where(eq(freeStartDrafts.ownerUserId, owner.id));
            await db.delete(authSession).where(eq(authSession.userId, owner.id));
            await db.execute(sql`delete from account where "userId" = ${owner.id}`);
            await db.delete(user).where(eq(user.id, owner.id));
          },
          () => db.execute(sql`delete from verification where identifier like ${`%${email}`}`),
          () => deleteMail(seen),
          ...pages.map(page => () => page.context().close()),
          async () => {
            expect(
              changedTables(dayZero, await tableCounts()),
              'every row of the run was removed'
            ).toEqual({});
          },
        ],
        failure
      );
    }
  });
});
