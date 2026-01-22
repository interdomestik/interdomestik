import { expect, type Locator, type Page, type TestInfo } from '@playwright/test';
import { routes } from '../routes';
import { detectBranchesLayout, type BranchesLayout } from '../utils/layout';

// NOTE: Overlay interactions (Radix Dropdown/Dialog) are known flaky in E2E.
// Do not use these methods for gate specs. Prefer API helpers (e2e/api/branches.api.ts).
// Overlay coverage lives in @docs/E2E_QUARANTINE_BURNDOWN.md tests.

interface CreateBranchInput {
  name: string;
  code: string;
}

export class BranchesScreen {
  private readonly page: Page;
  private layout: BranchesLayout | null = null;

  constructor(page: Page) {
    this.page = page;
  }

  async goto(testInfo: TestInfo): Promise<void> {
    await this.page.goto(routes.adminBranches(testInfo));
    // Disable animations to reduce flakiness
    await this.page.addStyleTag({
      content:
        '*, *::before, *::after { animation-duration: 0s !important; transition-duration: 0s !important; }',
    });
    await this.page.waitForLoadState('domcontentloaded');
    await this.page.waitForLoadState('networkidle');
  }

  async assertLoaded(): Promise<void> {
    await expect(this.page).toHaveURL(/\/(sq|mk|en)\/admin\/branches/);
    await expect(this.page.getByTestId('branches-screen')).toBeVisible();
    await this.ensureLayout();
  }

  async openCreateDialog(): Promise<void> {
    await this.page.getByTestId('create-branch-button').click();
    await expect(this.page.getByTestId('branch-name-input')).toBeVisible();
  }

  async fillCreateForm({ name, code }: CreateBranchInput): Promise<void> {
    await this.page.getByTestId('branch-name-input').fill(name);
    await this.page.getByTestId('branch-code-input').fill(code);
  }

  async submitCreateForm(): Promise<void> {
    await this.page.getByTestId('branch-submit-button').click();
    await expect(this.page.getByRole('dialog')).not.toBeVisible();
  }

  async createBranch(input: CreateBranchInput): Promise<void> {
    await this.openCreateDialog();
    await this.fillCreateForm(input);
    await this.submitCreateForm();
  }

  async cleanupByCode(code: string): Promise<void> {
    while (true) {
      const items = await this.branchItems(code);
      const count = await items.count();
      if (count === 0) break;

      console.log(`[BranchesScreen] Cleaning up ${count} existing branches...`);
      const item = items.first();
      await this.openActionsMenu(item);
      await this.openMenuItem('branch-delete-button').click();
      await this.page.getByTestId('branch-delete-confirm-button').click();
      await expect(item).not.toBeVisible();
      await this.page.waitForTimeout(500);
    }
  }

  async assertBranchVisible(text: string): Promise<void> {
    await expect(await this.branchItems(text)).toBeVisible();
  }

  async openBranchActions(text: string): Promise<void> {
    const item = (await this.branchItems(text)).first();
    await this.openActionsMenu(item);
  }

  async editBranchName(currentText: string, nextName: string): Promise<void> {
    await this.openBranchActions(currentText);
    await this.openMenuItem('branch-edit-button').click();
    const nameInput = this.page.getByTestId('branch-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(nextName);
    await this.page.getByTestId('branch-submit-button').click();
    await this.assertBranchVisible(nextName);
  }

  async deleteBranch(text: string): Promise<void> {
    await this.openBranchActions(text);
    await this.openMenuItem('branch-delete-button').click();
    await this.page.getByTestId('branch-delete-confirm-button').click();
    await expect(await this.branchItems(text)).not.toBeVisible();
  }

  private async ensureLayout(): Promise<BranchesLayout> {
    if (this.layout) return this.layout;
    this.layout = await detectBranchesLayout(this.page);
    console.log(`[BranchesScreen] layout=${this.layout}`);
    if (this.layout === 'unknown') {
      throw new Error('Branches screen layout not detected. Expected table or cards.');
    }
    return this.layout;
  }

  private async branchItems(text: string) {
    const layout = await this.ensureLayout();
    if (layout === 'table') {
      return this.page
        .getByTestId('branches-table')
        .getByTestId('branch-item')
        .filter({ hasText: text });
    }
    return this.page.getByTestId('branch-item').filter({ hasText: text });
  }

  private async openActionsMenu(item: Locator): Promise<void> {
    const trigger = item.getByTestId('branch-actions-trigger');
    const menu = this.page.locator('[data-testid="branch-actions-menu"], [role="menu"]').first();
    const deleteItem = this.page.getByTestId('branch-delete-button').first();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await trigger.scrollIntoViewIfNeeded();
      try {
        await trigger.click();
        await expect(menu).toBeVisible({ timeout: 1500 });
        await expect(deleteItem).toBeVisible({ timeout: 1500 });
        return;
      } catch {
        await trigger.dispatchEvent('pointerdown').catch(() => undefined);
        await this.page.waitForTimeout(150);
        if (await menu.isVisible().catch(() => false)) return;
      }
    }

    const currentUrl = this.page.url();
    const menuVisible = await menu.isVisible().catch(() => false);
    throw new Error(
      `Branch actions menu did not open. url=${currentUrl} menuVisible=${menuVisible}`
    );
  }

  private openMenuItem(testId: 'branch-edit-button' | 'branch-delete-button'): Locator {
    return this.page.getByTestId(testId).first();
  }
}
