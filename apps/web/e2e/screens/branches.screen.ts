import { expect, type Locator, type Page } from '@playwright/test';
import { routes } from '../routes';
import { detectBranchesLayout, type BranchesLayout } from '../utils/layout';

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

  async goto(): Promise<void> {
    await this.page.goto(routes.adminBranches());
    await this.page.waitForLoadState('domcontentloaded');
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
      await this.page.getByTestId('branch-delete-button').first().click();
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
    await this.page.getByTestId('branch-edit-button').click();
    const nameInput = this.page.getByTestId('branch-name-input');
    await expect(nameInput).toBeVisible();
    await nameInput.fill(nextName);
    await this.page.getByTestId('branch-submit-button').click();
    await this.assertBranchVisible(nextName);
  }

  async deleteBranch(text: string): Promise<void> {
    await this.openBranchActions(text);
    await this.page.getByTestId('branch-delete-button').click();
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
    const editButton = this.page.getByTestId('branch-edit-button').first();

    for (let attempt = 0; attempt < 3; attempt += 1) {
      await trigger.click();
      if (await editButton.isVisible().catch(() => false)) return;
      await this.page.waitForTimeout(250);
    }

    throw new Error('Branch actions menu did not open.');
  }
}
