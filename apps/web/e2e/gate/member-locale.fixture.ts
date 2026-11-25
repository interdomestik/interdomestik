// prettier-ignore
import { account, db, e2eEmail, E2E_PASSWORD, eq, session as authSession, subscriptions, user } from '@interdomestik/database';
import { randomUUID } from 'node:crypto';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { z } from 'zod';
import { getTenantFromTestInfo } from '../fixtures/auth.project';
import { getUserForTenant } from '../fixtures/auth-users';
import { fixtureLegalAcceptance } from '../fixtures/legal-acceptance.fixture';
import { inSequence } from './in-sequence';

const signupResponse = z.object({
  user: z.object({ branchId: z.string().nullable(), id: z.string(), tenantId: z.string() }),
});

export type ThrowawayMember = Readonly<{
  /** Resolves when the member is signed in on `page` with legal acceptance and an active subscription. */
  ready: Promise<void>;
  /** Waits for setup to settle, whatever its outcome, then attempts each cleanup step. */
  remove: () => Promise<void>;
}>;

/**
 * The sidebar language switch saves the member's preferred locale (WP-11), and server-built links,
 * such as notification links, follow it. A test that switches language therefore signs in a member
 * of its own on `page`, so no shared seeded member's stored locale changes while other specs read
 * it. The handle is returned before any I/O starts, so a teardown hook holds it even when the test
 * times out during setup.
 */
export function startThrowawayMember(page: Page, testInfo: TestInfo): ThrowawayMember {
  const { tenantId } = getUserForTenant('member', getTenantFromTestInfo(testInfo));
  const key = `wp11-locale-${testInfo.project.name}-${testInfo.workerIndex}-${testInfo.retry}-${randomUUID()}`;
  const email = e2eEmail(key);
  const ready = (async () => {
    const origin = new URL(String(testInfo.project.use.baseURL)).origin;
    const signup = await page.request.post(`${origin}/api/auth/sign-up/email`, {
      data: {
        email,
        name: 'WP-11 locale switch',
        onboarding: { mode: 'resolved', tenant: tenantId },
        password: E2E_PASSWORD,
      },
      headers: { Origin: origin, Referer: `${origin}/register` },
    });
    if (!signup.ok()) throw new Error(`Throwaway member signup failed: ${signup.status()}`);
    const { user: member } = signupResponse.parse(await signup.json());
    expect(member.tenantId).toBe(tenantId);
    await fixtureLegalAcceptance('seed', [{ id: member.id, tenantId: member.tenantId, email }]);
    await db.insert(subscriptions).values({
      branchId: member.branchId,
      id: key,
      planId: 'standard',
      status: 'active',
      tenantId: member.tenantId,
      userId: member.id,
    });
  })();
  const remove = async () => {
    await ready.catch(() => undefined);
    const errors: unknown[] = [];
    try {
      await db.delete(subscriptions).where(eq(subscriptions.id, key));
    } catch (error) {
      errors.push(error);
    }

    let memberId: string | undefined;
    try {
      const member = await db.query.user.findFirst({
        columns: { id: true, tenantId: true },
        where: eq(user.email, email),
      });
      if (member) {
        memberId = member.id;
        await fixtureLegalAcceptance('clean', [{ ...member, email }]);
      }
    } catch (error) {
      errors.push(error);
    } finally {
      if (memberId !== undefined) await deleteThrowawayMember(memberId, errors);
      // Playwright reports a hook error beside any test error, so a leak is never silent.
      if (errors.length > 0) throw errors[0];
    }
  };
  return { ready, remove };
}

async function deleteThrowawayMember(memberId: string, errors: unknown[]) {
  const deletions = [
    () => db.delete(authSession).where(eq(authSession.userId, memberId)),
    () => db.delete(account).where(eq(account.userId, memberId)),
    () => db.delete(user).where(eq(user.id, memberId)),
  ];
  await inSequence(deletions, async remove => {
    try {
      await remove();
    } catch (error) {
      errors.push(error);
    }
  });
}

export async function switchLocale(
  page: Page,
  languageLabel: string,
  optionLabel: string,
  expectedPath: string
) {
  const userMenuButton = page.locator('[data-testid="sidebar-user-menu-button"]:visible');
  await expect(userMenuButton).toHaveCount(1);
  await userMenuButton.click();
  await page.getByText(languageLabel, { exact: true }).hover();
  await page.getByRole('menuitem').filter({ hasText: optionLabel }).click();
  await expect.poll(() => new URL(page.url()).pathname).toBe(expectedPath);
}
