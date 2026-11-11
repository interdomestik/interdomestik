import { randomUUID } from 'node:crypto';
import { resumeFreeStartDraft } from '@interdomestik/database/free-start-drafts';
import { E2E_USER_IDS, E2E_USERS } from '@interdomestik/database';
import { test, expect, loginAtDoor } from '../fixtures/one-door.fixture';
import { withDoorDraft, doorDraftContext, doorDraftRow } from '../fixtures/one-door-draft.fixture';
import { gotoApp } from '../utils/navigation';

const owners = [
  { actor: 'KS_MEMBER', locale: 'sq' },
  { actor: 'MK_MEMBER', locale: 'mk' },
  { actor: 'PILOT_MK_MEMBER', locale: 'en' },
] as const;

test.describe('one-door account draft session scope', () => {
  for (const owner of owners) {
    test(`${owner.actor} saves and reloads its own draft at the door`, async ({ door }, info) => {
      await withDoorDraft(owner.actor, async (draft, context) => {
        await loginAtDoor(door.page, door.origin, owner.locale, owner.actor, info);
        const path = `/${owner.locale}/member/claims/new?mode=drafts#draft=${draft.id}`;
        await gotoApp(door.page, path, info, {
          baseURL: door.origin,
          marker: 'new-claim-page-ready',
        });
        const intake = door.page.getByTestId('claim-draft-intake');
        await expect(intake).toHaveAttribute('data-save-behavior', 'account-autosave');
        const summary = intake.locator('#free-start-summary');
        await expect(summary).toHaveValue(draft.summary);
        const edited = `Saved at the door ${randomUUID()}`;
        await summary.fill(edited);
        await expect
          .poll(async () => {
            const saved = await resumeFreeStartDraft(context, draft.id);
            return saved.ok ? saved.draft.summary : null;
          })
          .toBe(edited);
        await expect(intake.getByTestId('account-draft-status')).toHaveAttribute(
          'data-state',
          'saved'
        );
        const saved = await resumeFreeStartDraft(context, draft.id);
        expect(saved.ok).toBe(true);
        if (!saved.ok) throw new Error('Saved draft missing');
        expect(saved.draft.version).toBeGreaterThan(draft.version);
        expect(await doorDraftRow(draft.id)).toMatchObject({
          ownerUserId: E2E_USER_IDS[owner.actor],
          tenantId: E2E_USERS[owner.actor].tenantId,
          accessTenantId: E2E_USERS[owner.actor].tenantId,
        });
        await door.page.reload();
        await expect(summary).toHaveValue(edited);
        expect(await resumeFreeStartDraft(context, draft.id)).toEqual(saved);
        expect(new URL(door.page.url()).origin).toBe(door.origin);
      });
    });
  }

  for (const viewer of owners)
    for (const foreign of owners) {
      if (viewer.actor === foreign.actor) continue;
      test(`${viewer.actor} cannot read ${foreign.actor}'s draft at the door`, async ({
        door,
      }, info) => {
        await withDoorDraft(foreign.actor, async (draft, context) => {
          const before = await doorDraftRow(draft.id);
          await loginAtDoor(door.page, door.origin, viewer.locale, viewer.actor, info);
          const path = `/${viewer.locale}/member/claims/new?mode=drafts`;
          await gotoApp(door.page, `${path}#draft=${draft.id}`, info, {
            baseURL: door.origin,
            marker: 'new-claim-page-ready',
          });
          const notice = door.page.getByTestId('draft-continuation-notice');
          await expect(notice.getByRole('alert')).toBeVisible();
          const genericDenial = await notice.getByRole('alert').innerText();
          await expect(door.page.getByText(draft.summary, { exact: true })).toHaveCount(0);
          expect(await resumeFreeStartDraft(context, draft.id)).toEqual({ ok: true, draft });
          expect(await doorDraftRow(draft.id)).toEqual(before);
          expect(await resumeFreeStartDraft(doorDraftContext(viewer.actor), draft.id)).toEqual({
            ok: false,
            code: 'notFound',
          });
          await gotoApp(door.page, `${path}#draft=${randomUUID()}`, info, {
            baseURL: door.origin,
            marker: 'new-claim-page-ready',
          });
          await expect(notice.getByRole('alert')).toHaveText(genericDenial);
          expect(await resumeFreeStartDraft(context, draft.id)).toEqual({ ok: true, draft });
          expect(await doorDraftRow(draft.id)).toEqual(before);
        });
      });
    }
});
