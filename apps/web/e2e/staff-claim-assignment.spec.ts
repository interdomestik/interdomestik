import { expect, test } from './fixtures/auth.fixture';
import { routes } from './routes';
import { gotoApp } from './utils/navigation';

test.describe('Staff Claim Assignment MVP', () => {
  test('seeded staff can assign a claim manually from the detail page', async ({
    staffPage: page,
  }, testInfo) => {
    await gotoApp(page, routes.staffClaims(testInfo), testInfo, {
      marker: 'staff-page-ready',
    });

    await expect(page.getByTestId('staff-claims-row').first()).toBeVisible();
    const detailHref = await page.getByTestId('staff-claims-view').first().getAttribute('href');
    if (!detailHref) {
      throw new Error('Expected the staff queue row to expose a detail link.');
    }

    await page.goto(detailHref);

    await expect(page).toHaveURL(/\/staff\/claims\/[^/]+$/);
    await expect(page.getByTestId('staff-claim-detail-ready')).toBeVisible();

    const assignmentSelect = page.getByTestId('staff-assignment-select');
    await expect(assignmentSelect).toBeVisible();
    const assignableStaffCount = await assignmentSelect.locator('option:not([disabled])').count();

    expect(assignableStaffCount).toBeGreaterThanOrEqual(2);

    const targetAssignment = await assignmentSelect.evaluate(element => {
      const select = element as HTMLSelectElement;
      const currentValue = select.value;
      const nextOption = Array.from(select.options).find(
        option => !option.disabled && option.value !== currentValue
      );

      if (!nextOption) {
        throw new Error('Expected at least two assignable staff options in the seeded tenant.');
      }

      return {
        value: nextOption.value,
      };
    });

    await assignmentSelect.selectOption(targetAssignment.value);
    await expect(page.getByTestId('staff-assign-claim-button')).toBeEnabled();
    await page.getByTestId('staff-assign-claim-button').click();

    await page.waitForLoadState('networkidle');
    await page.reload();
    await expect(page.getByTestId('staff-claim-detail-ready')).toBeVisible();
    await expect(page.getByTestId('staff-assignment-select')).toHaveValue(targetAssignment.value);
    await expect(page.getByTestId('staff-assign-claim-button')).toBeDisabled();
  });
});
