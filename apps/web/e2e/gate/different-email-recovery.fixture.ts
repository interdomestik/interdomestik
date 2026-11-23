import {
  account,
  and,
  auditLog,
  dbAdmin,
  e2eEmail,
  E2E_PASSWORD,
  eq,
  inArray,
  session,
  user,
  verification,
} from '@interdomestik/database';
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
  const now = new Date();
  await dbAdmin.transaction(async tx => {
    await tx.insert(user).values({
      id,
      email,
      tenantId,
      name: 'Recovery browser fixture',
      role,
      emailVerified: true,
      tenantClassificationPending: false,
      createdAt: now,
      updatedAt: now,
    });
    await tx.insert(account).values({
      id: randomUUID(),
      accountId: email,
      providerId: 'credential',
      userId: id,
      password: await hash(E2E_PASSWORD, 10),
      createdAt: now,
      updatedAt: now,
    });
  });

  try {
    await run({ id, email });
  } finally {
    await dbAdmin.transaction(async tx => {
      await tx
        .delete(verification)
        .where(
          inArray(verification.identifier, [
            `ida-ui03b:${id}:current`,
            `ida-ui03b:${id}:replacement`,
          ])
        );
      await tx
        .delete(auditLog)
        .where(and(eq(auditLog.actorId, id), eq(auditLog.tenantId, tenantId)));
      await tx.delete(session).where(eq(session.userId, id));
      await tx.delete(account).where(eq(account.userId, id));
      await tx.delete(user).where(eq(user.id, id));
    });
  }
}

export function persistedOwner(id: string) {
  return dbAdmin.query.user.findFirst({
    columns: { id: true, email: true, emailVerified: true, tenantId: true },
    where: eq(user.id, id),
  });
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

export async function changeIntake(page: Page, enabled: boolean) {
  await page
    .getByLabel('Reason for the change (at least 10 characters)')
    .fill(
      enabled ? 'Restore intake after the recovery gate' : 'Close intake for the recovery gate'
    );
  if (enabled) await page.getByLabel('Signed restart approval reference').fill('E2E recovery gate');
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
