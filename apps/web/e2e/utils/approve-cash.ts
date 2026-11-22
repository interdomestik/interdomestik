import { db, eq, memberLeads } from '@interdomestik/database';
import { expect, test, type Page, type Request as PlaywrightRequest } from '@playwright/test';
import { gotoApp } from './navigation';

export async function approveCash(admin: Page, baseURL: string, email: string): Promise<void> {
  await gotoApp(admin, `admin/leads?${new URLSearchParams({ query: email })}`, test.info(), {
    baseURL,
    marker: 'verification-ops-page',
  });
  const row = admin
    .getByTestId('cash-verification-row')
    .filter({ visible: true })
    .filter({ has: admin.getByText(email, { exact: true }) });
  const approve = row.getByTestId('cash-approve');
  await expect(approve).toBeVisible({ timeout: 30_000 });
  // The server-rendered marker can precede hydration, and a click before it is silently lost.
  // React sets its props key on a node as it hydrates it; server HTML alone never carries it.
  await expect
    .poll(
      () =>
        approve.evaluate(node => Object.keys(node).some(key => key.startsWith('__reactProps$'))),
      { timeout: 20_000, message: `cash-approve for ${email} was never hydrated` }
    )
    .toBe(true);
  // One click only. Requests are recorded from before it, and the click and the dispatch check
  // both settle before any failure. A lost click fails here, not as a null conversion poll.
  let approvalSent = false;
  const recordApproval = (request: PlaywrightRequest) => {
    if (
      request.method() === 'POST' &&
      request.headers()['next-action'] !== undefined &&
      (request.postData() ?? '').includes('"decision":"approve"')
    ) {
      approvalSent = true;
    }
  };
  const settledError = (error: unknown) => error;
  admin.on('request', recordApproval);
  let clickError: unknown;
  let dispatchError: unknown;
  try {
    clickError = await approve.click({ timeout: 10_000 }).then(() => null, settledError);
    // A click can fail after its input reached the page, so the dispatch check runs either way.
    dispatchError = await expect
      .poll(() => approvalSent, {
        timeout: 10_000,
        message: `cash-approve for ${email} sent no approval server action`,
      })
      .toBe(true)
      .then(() => null, settledError);
  } finally {
    admin.off('request', recordApproval);
  }
  if (!approvalSent) throw clickError ?? dispatchError;
  // A sent approval is always followed to its conversion, even after a click error, so cleanup
  // never races it. Only a conversion slower than this poll can still finish after cleanup.
  await expect
    .poll(
      async () => {
        const [lead] = await db
          .select({ memberId: memberLeads.convertedUserId })
          .from(memberLeads)
          .where(eq(memberLeads.email, email));
        return lead?.memberId ?? null;
      },
      { timeout: 30_000, message: `cash approval for ${email} converted no member` }
    )
    .not.toBeNull();
  if (clickError) throw clickError;
}
