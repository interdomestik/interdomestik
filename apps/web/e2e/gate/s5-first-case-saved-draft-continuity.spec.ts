import { E2E_USERS } from '@interdomestik/database';
import {
  deleteFreeStartDraft,
  listFreeStartDrafts,
  resumeFreeStartDraft,
  updateFreeStartDraft,
} from '@interdomestik/database/free-start-drafts';
import { expect, test, type Page } from '@playwright/test';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
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
  type S5Session,
} from './s5-saved-draft.fixture';

test.describe('S5 first-case saved-draft continuity', () => {
  test('an active member who starts signed out reaches exactly one correct case', async ({
    browser,
  }, testInfo) => {
    test.skip(testInfo.project.name !== 'gate-ks-sq', 'One canonical run creates the claim.');
    test.setTimeout(240_000);
    const info = idaTarget(testInfo);
    const runId = `${testInfo.workerIndex}-${testInfo.retry}-${Date.now()}`;
    const journey = { counterparty: `S5 Insurer ${runId}`, summary: `S5 continuity ${runId}.` };
    const sessions: S5Session[] = [];
    const pages: Page[] = [];
    const open = async () => {
      const page = await newPage(browser, info);
      pages.push(page);
      return page;
    };
    let claimId: string | null = null;
    const owner = await ownerContext(E2E_USERS.KS_MEMBER);
    const other = await ownerContext(E2E_USERS.KS_MEMBER_EMPTY);
    try {
      const start = await open();
      await gotoApp(start, routes.home('en'), info, { marker: 'free-start-intake-shell' });
      await start.getByTestId('cookie-consent-accept').click();
      const anonymous = await start.request.get(`${idaOrigin(info)}/api/auth/get-session`);
      expect(anonymous.status(), 'session probe answers').toBe(200);
      expect(await anonymous.json(), 'starts signed out').toBeNull();

      const flow = start.getByTestId('premium-free-start-organizer');
      await flow.getByTestId('free-start-category-vehicle').click();
      await flow.getByRole('button', { name: 'Continue to guided intake' }).click();
      await flow.getByLabel('What happened?').selectOption('collision');
      await flow.getByLabel('When did it happen?').fill(S3_JOURNEY_INCIDENT_DATE);
      await flow.getByLabel('Who are you dealing with?').fill(journey.counterparty);
      await flow.getByLabel('What do you want to recover?').selectOption('repair');
      await flow.getByLabel('Brief summary').fill(journey.summary);
      await flow.getByRole('button', { name: 'Review your summary' }).click();

      await test.step('existing member secure-saves the prepared facts', async () => {
        sessions.push(await signIn(start, info, E2E_USERS.KS_MEMBER));
        await flow.getByTestId('free-start-save-open').click();
        await expect(flow.getByTestId('free-start-save-status')).toHaveAttribute(
          'data-state',
          'saved'
        );
      });
      const saved = (await listFreeStartDrafts(owner, { limit: 50 })).items.filter(
        item => item.summary === journey.summary
      );
      expect(saved).toHaveLength(1);
      const draft = saved[0]!;
      expect(draft).toMatchObject({
        category: 'vehicle',
        counterparty: journey.counterparty,
        desiredOutcome: 'repair',
        incidentDate: S3_JOURNEY_INCIDENT_DATE,
        issueType: 'collision',
        resumeStep: 'preview',
      });
      expect(await journeyClaims(journey), 'saving never creates a claim').toEqual([]);

      await test.step('another member cannot list, read, change or delete the draft', async () => {
        const listed = await listFreeStartDrafts(other, { limit: 50 });
        expect(listed.items.map(item => item.id)).not.toContain(draft.id);
        const denied = { ok: false, code: 'notFound' };
        expect(await resumeFreeStartDraft(other, draft.id)).toEqual(denied);
        const change = {
          category: draft.category,
          counterparty: draft.counterparty,
          desiredOutcome: 'repair' as const,
          expectedVersion: draft.version,
          id: draft.id,
          incidentDate: draft.incidentDate,
          issueType: 'collision' as const,
          resumeStep: draft.resumeStep,
          summary: 'Foreign overwrite attempt.',
        };
        expect(await updateFreeStartDraft(other, change)).toEqual(denied);
        const removal = { expectedVersion: draft.version, id: draft.id };
        expect(await deleteFreeStartDraft(other, removal)).toEqual(denied);
        const intact = await resumeFreeStartDraft(owner, draft.id);
        expect(intact).toMatchObject({ ok: true, draft: { summary: journey.summary } });
        expect(intact.ok && intact.draft.version).toBe(draft.version);

        const intruder = await open();
        sessions.push(await signIn(intruder, info, E2E_USERS.KS_MEMBER_EMPTY));
        const foreign = await openSavedDrafts(intruder, info);
        await expect(foreign.locator('li').filter({ hasText: journey.summary })).toHaveCount(0);
      });

      await test.step('owner reviews the exact facts and submits once', async () => {
        const member = await open();
        sessions.push(await signIn(member, info, E2E_USERS.KS_MEMBER));
        const intake = await openSavedDrafts(member, info);
        const entry = intake.locator('li').filter({ hasText: journey.summary });
        await expect(entry).toHaveCount(1);
        await entry.getByTestId(/^free-start-resume-/).click();
        const preview = intake.locator('dl');
        for (const fact of [
          'Vehicle damage',
          'Collision damage',
          S3_JOURNEY_INCIDENT_DATE,
          journey.counterparty,
          'Repair or replacement costs',
          journey.summary,
        ])
          await expect(preview).toContainText(fact);
        await expect(intake.getByTestId('claim-created-success')).toHaveCount(0);
        expect(await journeyClaims(journey), 'no claim before explicit submission').toEqual([]);

        const submit = intake.getByTestId('claim-draft-submit');
        await expect(submit).toBeEnabled();
        await submit.click();
        const success = intake.getByTestId('claim-created-success');
        await expect(success).toBeVisible();
        const created = await journeyClaims(journey);
        expect(created).toEqual([{ id: expect.any(String), userId: owner.ownerUserId }]);
        claimId = created[0]!.id;
        const claimHref = routes.memberClaimDetail(claimId, 'en');
        await expect(success.getByRole('link')).toHaveAttribute('href', claimHref);
        const claimNumber = await success.getAttribute('data-claim-number');
        expect(claimNumber, 'claim number is shown').toBeTruthy();

        const again = await openSavedDrafts(member, info);
        await again
          .locator('li')
          .filter({ hasText: journey.summary })
          .getByTestId(/^free-start-resume-/)
          .click();
        const existing = again.getByTestId('claim-created-success');
        await expect(existing).toHaveAttribute('data-claim-number', claimNumber!);
        await expect(again.getByTestId('claim-draft-submit')).toHaveCount(0);
        expect(await journeyClaims(journey), 'still exactly one claim').toHaveLength(1);
      });
    } finally {
      await cleanupS5(claimId, journey);
      for (const session of sessions) await signOut(session);
      await Promise.all(pages.map(page => page.context().close()));
      await expectJourneyClean(claimId, journey);
    }
  });
});
