import { OPS_TEST_IDS } from '../../src/components/ops/testids';
import en from '../../src/messages/en/agent.json';
import mk from '../../src/messages/mk/agent.json';
import sq from '../../src/messages/sq/agent.json';
import sr from '../../src/messages/sr/agent.json';
import { expect, test } from '../fixtures/auth.fixture';
import { routes } from '../routes';
import { messagesFor } from '../utils/locale-messages';
import { gotoApp } from '../utils/navigation';

// Every tenant's signed-in agent has seeded claims, so the queue is never empty here: an empty
// queue is a seed failure, not an accepted state.
test.describe('Agent Pro Claims (Golden)', () => {
  test('Agent can access Pro Claims queue (Read-Only)', async ({ agentPage: page }, testInfo) => {
    const messages = messagesFor({ en, mk, sq, sr }, testInfo).agent;
    const t = messages.claimsPro;
    await gotoApp(page, routes.agentWorkspace(testInfo), testInfo, { marker: 'agent-pro-shell' });

    // The role shell's sidebar links to the same queue, so open it from the workspace card.
    const openQueue = page
      .getByTestId('workspace-card-claims')
      .getByRole('link', { name: messages.workspace.cards.claims.action_text, exact: true })
      .filter({ visible: true });
    await expect(async () => {
      await openQueue.click();
      await expect(page).toHaveURL(new RegExp(`.*${routes.agentWorkspaceClaims(testInfo)}`));
    }).toPass({ timeout: 10000 });

    // The router keeps a hidden copy of a revisited page, so the queue is read where visible.
    const queue = page.getByTestId('agent-claims-pro-page').filter({ visible: true });
    await expect(queue).toBeVisible();
    await expect(queue.getByTestId('ops-filters-bar')).toBeVisible();
    await expect(queue.getByTestId('claims-search')).toBeVisible();
    for (const header of [t.columns.claim, t.columns.status, t.columns.member]) {
      await expect(queue.getByRole('columnheader', { name: header, exact: true })).toBeVisible();
    }

    const firstRow = queue.getByTestId('claim-row').first();
    await expect(firstRow).toBeVisible();
    await firstRow.click();
    const drawer = page.getByTestId(OPS_TEST_IDS.DRAWER);
    await expect(drawer).toBeVisible();
    await expect(drawer.getByText(t.readOnlyDetails, { exact: true })).toBeVisible();
    await expect(page).toHaveURL(/selected=/);

    await page.keyboard.press('Escape');
    await expect(drawer).not.toBeVisible();
    await expect(page).not.toHaveURL(/selected=/);
  });
});
