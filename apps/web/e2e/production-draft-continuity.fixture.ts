import { E2E_USERS, and, claims, db, desc, eq, freeStartDrafts } from '@interdomestik/database';
import { expect, type Locator, type Page } from '@playwright/test';

const tenantId = E2E_USERS.KS_MEMBER.tenantId;
const draftScope = (ownerUserId: string) =>
  and(eq(freeStartDrafts.accessTenantId, tenantId), eq(freeStartDrafts.ownerUserId, ownerUserId));
const readDrafts = (ownerUserId: string) =>
  db.query.freeStartDrafts.findMany({
    where: draftScope(ownerUserId),
    orderBy: [desc(freeStartDrafts.updatedAt), desc(freeStartDrafts.id)],
  });
const readClaims = (ownerUserId: string) =>
  db.query.claims.findMany({
    where: and(eq(claims.tenantId, tenantId), eq(claims.userId, ownerUserId)),
    orderBy: [desc(claims.id)],
  });

export async function readSmokeOwnerBaseline(page: Page) {
  const response = await page.request.get(new URL('/api/auth/get-session', page.url()).href, {
    headers: { 'x-tenant-id': tenantId },
  });
  expect(response.ok()).toBe(true);
  const session = (await response.json()) as { user?: { id?: string; email?: string } } | null;
  expect(session?.user?.email).toBe(E2E_USERS.KS_MEMBER.email);
  const ownerUserId = session?.user?.id;
  if (!ownerUserId) throw new Error('smoke_session_owner_missing');
  return {
    ownerUserId,
    drafts: await readDrafts(ownerUserId),
    claims: await readClaims(ownerUserId),
  };
}

export type SmokeOwnerBaseline = Awaited<ReturnType<typeof readSmokeOwnerBaseline>>;

export async function startFreshSmokeDraft(
  page: Page,
  intake: Locator,
  baseline: SmokeOwnerBaseline
): Promise<void> {
  const [latest] = baseline.drafts;
  if (latest) {
    const status = intake.getByTestId('account-draft-status');
    await expect(status.getByRole('button')).toHaveCount(1);
    await expect(status).not.toHaveAttribute('data-state', 'loading');
    await intake.getByTestId('free-start-manage-open').click();
    await expect(intake.getByRole('heading', { level: 4 })).toBeFocused();
    // The complete manager busy interval disables cached actions until its list is adopted.
    const resume = page.getByTestId(`free-start-resume-${latest.id}`);
    await expect(resume).toBeEnabled();
    await resume.click();
    await expect(status).toHaveAttribute('data-state', 'saved');
    const startAnother = intake.getByTestId('free-start-start-another');
    await expect(startAnother).toBeEnabled();
    await startAnother.click();
    await expect(startAnother).toHaveCount(0);
  }
  await expect(intake.getByTestId('claim-draft-category-vehicle')).toBeEnabled();
  await expect(intake.getByTestId('claim-draft-category-injury')).toBeDisabled();
  await expect(intake.getByTestId('claim-created-success')).toHaveCount(0);
}

export async function assertSmokeSavedWithoutClaim(
  intake: Locator,
  baseline: SmokeOwnerBaseline,
  draftId: string,
  summary: string
): Promise<void> {
  const facts = intake.getByTestId('claim-draft-dormant-preview').locator('dd');
  await expect(facts).toHaveCount(6);
  for (const index of [0, 1, 4]) await expect(facts.nth(index)).not.toBeEmpty();
  await expect(facts.nth(2)).toHaveText('2026-07-20');
  await expect(facts.nth(3)).toHaveText('Test Company');
  await expect(facts.nth(5)).toHaveText(summary);
  await expect(intake.getByTestId('account-draft-status')).toHaveAttribute('data-state', 'saved');
  await expect(intake.getByTestId('claim-draft-submit')).toBeEnabled();
  await expect(intake.getByTestId('claim-created-success')).toHaveCount(0);
  const drafts = await readDrafts(baseline.ownerUserId);
  const saved = drafts.find(row => row.id === draftId);
  expect(saved).toMatchObject({
    tenantId,
    accessTenantId: tenantId,
    ownerUserId: baseline.ownerUserId,
    category: 'vehicle',
    issueType: 'collision',
    incidentDate: '2026-07-20',
    counterparty: 'Test Company',
    desiredOutcome: 'repair',
    summary,
    resumeStep: 'preview',
  });
  expect(saved?.version).toBeGreaterThanOrEqual(1);
  expect(baseline.drafts.map(row => row.id)).not.toContain(draftId);
  expect(drafts.filter(row => row.id !== draftId)).toEqual(baseline.drafts);
  expect(await readClaims(baseline.ownerUserId)).toEqual(baseline.claims);
}

export async function assertSmokeBaselineRestored(baseline: SmokeOwnerBaseline): Promise<void> {
  expect(await readDrafts(baseline.ownerUserId)).toEqual(baseline.drafts);
  expect(await readClaims(baseline.ownerUserId)).toEqual(baseline.claims);
}
