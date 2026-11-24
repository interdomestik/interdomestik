import { dbAdmin, e2eEmail, E2E_PASSWORD, sql } from '@interdomestik/database';
import { readDisposableTargetClass } from '@interdomestik/database/seed-target-classification';
import { expect, type Page, type TestInfo } from '@playwright/test';
import { hash } from 'bcryptjs';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { routes } from '../routes';
import { gotoApp } from '../utils/navigation';
import { api, json } from './s5-otp-mailbox.fixture';

export const tenantId = 'tenant_ks';
export const pilotHeaders = { 'x-tenant-id': tenantId };
const sessionUser = z.object({ user: z.object({ id: z.string(), tenantId: z.string() }) });

export async function withRecoveryAccount(
  role: 'member' | 'super_admin',
  run: (identity: { id: string; email: string }) => Promise<void>
) {
  if (!readDisposableTargetClass(process.env)) {
    throw new Error('Recovery browser fixtures require a disposable database');
  }
  const id = randomUUID();
  const email = e2eEmail(`recovery-${id}`);
  const now = new Date().toISOString();
  await dbAdmin.transaction(async tx => {
    await tx.execute(sql`
      insert into "user" (id, email, tenant_id, name, role, "emailVerified",
        tenant_classification_pending, "createdAt", "updatedAt")
      values (${id}, ${email}, ${tenantId}, 'Recovery browser fixture', ${role}, true, false,
        ${now}::timestamp, ${now}::timestamp)
    `);
    await tx.execute(sql`
      insert into account (id, "accountId", "providerId", "userId", password, "createdAt", "updatedAt")
      values (${randomUUID()}, ${email}, 'credential', ${id}, ${await hash(E2E_PASSWORD, 10)},
        ${now}::timestamp, ${now}::timestamp)
    `);
  });

  try {
    await run({ id, email });
  } finally {
    await dbAdmin.transaction(async tx => {
      await tx.execute(sql`
        delete from verification
        where identifier in (${`ida-ui03b:${id}:current`}, ${`ida-ui03b:${id}:replacement`})
      `);
      await tx.execute(sql`
        delete from audit_log where actor_id = ${id} and tenant_id = ${tenantId}
      `);
      await tx.execute(sql`delete from session where "userId" = ${id}`);
      await tx.execute(sql`delete from account where "userId" = ${id}`);
      await tx.execute(sql`delete from "user" where id = ${id}`);
    });
  }
}

export async function persistedOwner(id: string) {
  const [owner] = await dbAdmin.execute<{
    id: string;
    email: string;
    emailVerified: boolean;
    tenantId: string;
  }>(sql`select id, email, "emailVerified", tenant_id as "tenantId" from "user" where id = ${id}`);
  return owner;
}

export async function login(page: Page, origin: string, identity: { id: string; email: string }) {
  const response = await page.request.post(new URL('/api/auth/sign-in/email', origin).href, {
    data: { email: identity.email, password: E2E_PASSWORD },
    headers: { Origin: origin, Referer: `${origin}${routes.login('en')}`, ...pilotHeaders },
    maxRedirects: 0,
  });
  expect(response.ok(), 'synthetic sign-in succeeds').toBe(true);
  expect(z.object({ token: z.string() }).safeParse(await response.json()).success).toBe(true);
  const sessionResponse = await page.request.get(new URL('/api/auth/get-session', origin).href, {
    headers: { Origin: origin, ...pilotHeaders },
    maxRedirects: 0,
  });
  expect(sessionResponse.ok(), 'the signed-in session is readable').toBe(true);
  expect(sessionUser.parse(await sessionResponse.json()).user).toMatchObject({
    id: identity.id,
    tenantId,
  });
}

export async function navigateToPilotSettings(page: Page, info: TestInfo, origin: string) {
  await gotoApp(page, routes.adminSettings('en'), info, { baseURL: origin, marker: 'body' });
  await page.getByRole('combobox', { name: 'Switch', exact: true }).selectOption('public_intake');
}

// Next.js can keep a hidden copy of a prior route tree; getByRole skips it, getByLabel does not.
const field = (page: Page, label: string) => page.getByLabel(label).filter({ visible: true });

export async function changeIntake(page: Page, enabled: boolean) {
  await field(page, 'Reason for the change (at least 10 characters)').fill(
    enabled ? 'Restore intake after the recovery gate' : 'Close intake for the recovery gate'
  );
  if (enabled) await field(page, 'Signed restart approval reference').fill('E2E recovery gate');
  await page.getByRole('button', { name: enabled ? 'Open switch' : 'Close switch' }).click();
  await expect(
    page.getByRole('button', { name: enabled ? 'Close switch' : 'Open switch' })
  ).toBeVisible();
  await expect(page.getByText('Pilot switch updated.', { exact: true })).toBeVisible();
}

export async function mailIds(email: string) {
  const query = encodeURIComponent(`to:"${email}"`);
  const list = await json<{ messages: { ID: string }[] }>(
    await fetch(api(`search?query=${query}`))
  );
  return list.messages.map(message => message.ID);
}
