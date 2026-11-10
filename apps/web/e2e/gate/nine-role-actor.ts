import { E2E_PASSWORD, E2E_USER_IDS, E2E_USERS, type E2EUserKey } from '@interdomestik/database';
import { expect, test, type Page, type TestInfo } from '@playwright/test';
import { getProjectUrlInfo } from '../fixtures/auth.project';

/** Leaves the previous actor's page before the next sign-in; about:blank is not an app route. */
export async function leaveActorPage(page: Page): Promise<void> {
  await page.goto('about:blank');
}

/** Signs a catalogue actor in on the project host and proves the session belongs to it. */
export async function signInAs(page: Page, info: TestInfo, actor: E2EUserKey, ip: string) {
  const { origin } = getProjectUrlInfo(info, null);
  await page.context().clearCookies();
  const login = await page.request.post(`${origin}/api/auth/sign-in/email`, {
    data: { email: E2E_USERS[actor].email, password: E2E_PASSWORD },
    headers: { Origin: origin, 'x-forwarded-for': ip, ...info.project.use.extraHTTPHeaders },
  });
  expect(login.ok(), actor).toBeTruthy();
  expect((await login.json()).user.id).toBe(E2E_USER_IDS[actor]);
}

/** Restricts a test to the tenant host whose dataset seeds its actors and cases. */
export function requireSeededHost(
  info: TestInfo,
  project: (name: string) => boolean,
  timeoutMs: number
) {
  info.skip(!project(info.project.name), 'Actor and cases are seeded on another tenant host');
  test.setTimeout(timeoutMs);
}
