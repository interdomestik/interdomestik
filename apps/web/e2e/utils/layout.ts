import type { Page } from '@playwright/test';

export type BranchesLayout = 'table' | 'cards' | 'unknown';

export async function detectBranchesLayout(page: Page): Promise<BranchesLayout> {
  if ((await page.getByTestId('branches-table').count()) > 0) return 'table';
  if ((await page.getByTestId('branches-cards').count()) > 0) return 'cards';
  return 'unknown';
}
