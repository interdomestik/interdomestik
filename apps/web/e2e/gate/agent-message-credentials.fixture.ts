import { account, dbAdmin, E2E_USERS, user } from '@interdomestik/database';
import { and, eq } from 'drizzle-orm';

/** Reuse only deterministic seeded credentials for task-owned synthetic logins. */
export async function loadSyntheticMessagePasswords(isMk: boolean) {
  const memberEmail = isMk ? E2E_USERS.MK_MEMBER.email : E2E_USERS.KS_MEMBER.email;
  const staffEmail = isMk ? E2E_USERS.MK_STAFF.email : E2E_USERS.KS_STAFF.email;
  const member = await dbAdmin.query.user.findFirst({ where: eq(user.email, memberEmail) });
  const staff = await dbAdmin.query.user.findFirst({ where: eq(user.email, staffEmail) });
  if (!member || !staff) throw new Error('Missing seeded member or staff');

  const memberCredential = await dbAdmin.query.account.findFirst({
    where: and(eq(account.userId, member.id), eq(account.providerId, 'credential')),
  });
  const staffCredential = await dbAdmin.query.account.findFirst({
    where: and(eq(account.userId, staff.id), eq(account.providerId, 'credential')),
  });
  if (!memberCredential?.password || !staffCredential?.password) {
    throw new Error('Missing seeded member or staff credential');
  }
  return { memberPassword: memberCredential.password, staffPassword: staffCredential.password };
}
