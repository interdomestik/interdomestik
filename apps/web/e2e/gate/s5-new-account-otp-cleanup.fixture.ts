import {
  auditLog,
  crmLeads,
  db,
  eq,
  freeStartDrafts,
  inArray,
  or,
  session as authSession,
  sql,
  user,
} from '@interdomestik/database';
import { expect, type Page } from '@playwright/test';
import { deleteMail, type OtpMail, redact } from './s5-otp-mailbox.fixture';
import { teardown } from './s5-saved-draft.fixture';

export async function redactOtpFailure(error: unknown, mails: OtpMail[], pages: Page[]) {
  const failure = redact(error, mails);
  await Promise.all(
    pages.map(page =>
      page
        .locator('input')
        .evaluateAll(inputs => inputs.forEach(input => ((input as HTMLInputElement).value = '')))
        .catch(() => undefined)
    )
  );
  return failure;
}

export async function cleanupOtpJourney(args: {
  emails: string[];
  failure: unknown;
  pages: Page[];
  seen: Set<string>;
}) {
  const userRows = () => db.query.user.findMany({ where: inArray(user.email, args.emails) });
  const owners = await userRows().catch(() => []);
  await teardown(
    [
      ...owners.map(owner => async () => {
        const ids = (
          await db.query.freeStartDrafts.findMany({
            columns: { id: true },
            where: eq(freeStartDrafts.ownerUserId, owner.id),
          })
        ).map(row => row.id);
        const audit = or(
          eq(auditLog.actorId, owner.id),
          ids.length ? inArray(auditLog.entityId, ids) : undefined
        );
        await db.delete(auditLog).where(audit);
        await db.delete(freeStartDrafts).where(eq(freeStartDrafts.ownerUserId, owner.id));
        await db.delete(authSession).where(eq(authSession.userId, owner.id));
        await db.execute(sql`delete from account where "userId" = ${owner.id}`);
        await db.delete(user).where(eq(user.id, owner.id));
      }),
      ...args.emails.map(email => () => {
        const identifierPattern = `%${email}`;
        return db.execute(sql`delete from verification where identifier like ${identifierPattern}`);
      }),
      () => deleteMail(args.seen),
      ...args.pages.map(page => () => page.context().close()),
      async () => {
        expect(await userRows(), 'the task-owned accounts are removed').toEqual([]);
        expect(await db.$count(crmLeads, inArray(crmLeads.email, args.emails))).toBe(0);
      },
    ],
    args.failure
  );
}
