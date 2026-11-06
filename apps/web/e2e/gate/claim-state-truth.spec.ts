import { E2E_CLAIM_STATE_FIXTURES, type E2EClaimStateKey } from '@interdomestik/database';
import { expect, test } from '@playwright/test';
import en from '../../src/messages/en/claims.json';
import mk from '../../src/messages/mk/claims.json';
import sq from '../../src/messages/sq/claims.json';
import { getProjectUrlInfo } from '../fixtures/auth.project';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { isKsGateProject } from './gate-project-identity';
import { requireSeededHost, signInAs } from './nine-role-actor';

// Named claim states in KS-D: a member draft, a rejected (closed) case and a recovery submitted to
// the airline, all owned by the converted member. The member's list places each state by its
// lifecycle pair and labels it with its own status. Expectations are written here, not read from
// the seed catalogue; who may open each claim is in the nine-role access matrix.
type Placement = 'draft' | 'closed';
const PLACED: Record<Placement, E2EClaimStateKey> = { draft: 'DRAFT', closed: 'REJECTED' };
const STATUS_LABELS = { en: en.claims.status, mk: mk.claims.status, sq: sq.claims.status };
const STATES = Object.entries(E2E_CLAIM_STATE_FIXTURES) as [
  E2EClaimStateKey,
  (typeof E2E_CLAIM_STATE_FIXTURES)[E2EClaimStateKey],
][];

test('the owning member finds each named claim state placed and labelled', async ({
  page,
}, info) => {
  requireSeededHost(info, isKsGateProject, 90_000);
  const { origin, locale } = getProjectUrlInfo(info, null);
  const labels = STATUS_LABELS[locale as keyof typeof STATUS_LABELS];
  await signInAs(page, info, 'KS_MEMBER_CONVERTED_LEAD', '10.0.71.1');
  const ids = async (status?: Placement) => {
    const query = status ? `?status=${status}` : '';
    const response = await page.request.get(`${origin}/api/claims${query}`, {
      headers: info.project.use.extraHTTPHeaders,
    });
    expect(response.ok(), `claims ${status ?? 'all'}`).toBeTruthy();
    const body = (await response.json()) as { claims: { id: string }[] };
    return body.claims.map(claim => claim.id).sort();
  };
  expect(await ids()).toEqual(STATES.map(([, fixture]) => fixture.id).sort());
  for (const [placement, key] of Object.entries(PLACED) as [Placement, E2EClaimStateKey][]) {
    expect(await ids(placement), placement).toEqual([E2E_CLAIM_STATE_FIXTURES[key].id]);
  }

  await gotoApp(page, routes.memberClaims(info), info, { marker: 'member-claims-table-region' });
  for (const [key, fixture] of STATES) {
    const row = page
      .getByRole('row')
      .filter({ has: page.getByRole('link', { name: fixture.title, exact: true }) });
    await expect(row, key).toHaveCount(1);
    await expect(row, `${key} label`).toContainText(labels[fixture.status]);
  }
});
