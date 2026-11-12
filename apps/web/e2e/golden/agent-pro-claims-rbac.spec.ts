import { expect, test } from '../fixtures/auth.fixture';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';

// Seeded claims of each tenant's signed-in agent (golden seed `buildClaimsToSeed`), and a claim of
// the other tenant that the agent must never open.
const LINKED_CLAIM = {
  ks: {
    id: 'golden_ks_a_claim_01',
    title: 'KS-A SUBMITTED Claim 1',
    reference: 'KS-A SUBMITTED Claim 1',
  },
  mk: {
    id: 'golden_mk_track_claim_001',
    title: 'MK Deterministic Claim',
    reference: 'CLM-MK-2026-900001',
  },
} as const;
const CROSS_TENANT_CLAIM_ID = { ks: 'golden_claim_mk_1', mk: 'golden_ks_b_claim_01' } as const;

test.describe('Agent Pro Claims RBAC (Golden)', () => {
  test('Agent CAN access linked member claim but CANNOT access unlinked claim', async ({
    agentPage: page,
  }, testInfo) => {
    const tenant = getTenantFromTestInfo(testInfo) === 'mk' ? 'mk' : 'ks';
    const linked = LINKED_CLAIM[tenant];
    const claimsUrl = routes.agentWorkspaceClaims(testInfo);
    await gotoApp(page, claimsUrl, testInfo, { marker: 'agent-claims-pro-page' });

    // The router keeps a hidden copy of a revisited page, so the table is read where visible.
    const table = page.getByTestId('ops-table').filter({ visible: true });
    const drawerContent = page.getByTestId('ops-drawer-content');
    const selectedClaimId = drawerContent.getByTestId('workspace-selected-claim-id');

    // --- POSITIVE CASE (linked claim, opened from its row) ---
    const linkedRow = table.getByTestId('claim-row').filter({ hasText: linked.title });
    await expect(linkedRow).toHaveCount(1);
    await linkedRow.click();
    await expect(selectedClaimId).toHaveAttribute('data-claim-id', linked.id);
    await expect(selectedClaimId).toHaveText(linked.reference);

    await page
      .getByTestId('action-message')
      .first()
      .evaluate(el => (el as HTMLElement).click());
    await expect(page.getByTestId('messaging-panel')).toBeVisible();

    await page.getByTestId('sheet-close-button').evaluate((el: HTMLElement) => el.click());
    await expect(drawerContent).not.toBeVisible();

    // --- URL-forced drawer: the agent's own claim opens, so the refusal below comes from the
    // tenant filter and not from a URL parameter that never opens anything. ---
    await gotoApp(page, `${claimsUrl}?selected=${linked.id}`, testInfo, {
      marker: 'agent-claims-pro-page',
    });
    await expect(selectedClaimId).toHaveAttribute('data-claim-id', linked.id);
    await expect(selectedClaimId).toHaveText(linked.reference);

    // --- NEGATIVE CASE (cross-tenant claim) ---
    await gotoApp(page, `${claimsUrl}?selected=${CROSS_TENANT_CLAIM_ID[tenant]}`, testInfo, {
      marker: 'agent-claims-pro-page',
    });
    await expect(drawerContent).not.toBeVisible();
  });
});
