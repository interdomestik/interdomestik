import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { withAdminAssignmentFixture } from './admin-assignment.fixture';
import en from '../../src/messages/en/admin-claims.json';
import sq from '../../src/messages/sq/admin-claims.json';
import mk from '../../src/messages/mk/admin-claims.json';
import sr from '../../src/messages/sr/admin-claims.json';

const catalogs = { en, sq, mk, sr };

test('admin deliberately assigns an unassigned case to eligible staff and keeps the result after reload', async ({
  adminPage: page,
}, info) => {
  test.skip(
    !info.project.name.startsWith('gate-'),
    'Synthetic assignment proof is selected by tenant gate projects'
  );
  const locale = routes.getLocale(info);
  if (!(locale in catalogs)) throw new Error('Expected an approved assignment locale');
  const messages = catalogs[locale as keyof typeof catalogs].admin.claims_page;
  await withAdminAssignmentFixture(info, async fixture => {
    const before = await fixture.readState();
    expect(before.staffId).toBeNull();
    expect(before.audits).toHaveLength(0);
    const response = await gotoApp(page, `/admin/claims/${fixture.claimId}`, info, {
      marker: 'body',
    });
    expect(response?.status()).toBe(200);
    const heading = page
      .getByRole('heading', { level: 1, name: fixture.title, exact: true })
      .filter({ visible: true });
    await expect(heading).toHaveCount(1);
    await expect(page.getByTestId('not-found-page')).toHaveCount(0);
    const selector = page
      .getByRole('combobox', { name: messages.assignment.label, exact: true })
      .filter({ visible: true });
    await expect(selector).toHaveCount(1);
    await expect(selector).toBeEnabled();
    await expect(selector).toContainText(messages.assignment.placeholder);
    await expect(
      page.getByRole('button', { name: messages.next_actions.actions.assign.label, exact: true })
    ).toHaveCount(0);

    // Escape is a real non-mutating keyboard cancellation, with focus returned to the trigger.
    await selector.focus();
    await selector.press('ArrowDown');
    const option = page.getByRole('option', { name: fixture.staffLabel, exact: true });
    await expect(option).toHaveCount(1);
    await expect(option).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(selector).toBeFocused();
    expect((await fixture.readState()).staffId).toBeNull();
    expect((await fixture.readState()).audits).toHaveLength(0);

    await selector.click();
    await expect(option).toBeVisible();
    await Promise.all([page.waitForEvent('load'), option.click()]);
    await expect(heading).toHaveCount(1);
    await expect.poll(async () => (await fixture.readState()).staffId).toBe(fixture.staffId);
    await expect(
      page.getByText(fixture.staffLabel, { exact: true }).filter({ visible: true })
    ).toHaveCount(1);
    const committed = await fixture.readState();
    expect(committed.assignedAt).toBeInstanceOf(Date);
    expect(committed.assignedById).toBeTruthy();
    expect(committed.lifecycleUnchanged).toBe(true);
    expect(committed.audits).toEqual([
      {
        action: 'assign_owner',
        actorId: committed.assignedById,
        metadata: {
          previousStaffId: null,
          newStaffId: fixture.staffId,
          claimNumber: fixture.claimId,
        },
      },
    ]);
    expect(committed.messageCount).toBe(before.messageCount);
    expect(committed.historyCount).toBe(before.historyCount);

    const reload = await page.reload({ waitUntil: 'domcontentloaded' });
    expect(reload?.status()).toBe(200);
    await expect(heading).toHaveCount(1);
    await expect(
      page.getByText(fixture.staffLabel, { exact: true }).filter({ visible: true })
    ).toHaveCount(1);
    const durable = await fixture.readState();
    expect(durable.staffId).toBe(fixture.staffId);
    expect(durable.audits).toHaveLength(1);
    expect(durable.lifecycleUnchanged).toBe(true);
    expect(durable.messageCount).toBe(before.messageCount);
    expect(durable.historyCount).toBe(before.historyCount);
  });
});
