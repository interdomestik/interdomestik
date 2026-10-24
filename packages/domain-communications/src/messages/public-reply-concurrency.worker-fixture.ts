/** Private fixed fixture executable. Credentials come from its owned parent, never arguments/logs. */
import fs from 'node:fs';
import { dbAdmin, dbRls, sql } from '@interdomestik/database';
import { assertRlsConnectionRoleReady } from '@interdomestik/database/db';
import { preparePublicReplyNotification } from './public-reply-notification';

async function main() {
  try {
    await assertRlsConnectionRoleReady();
    const params = JSON.parse(fs.readFileSync(0, 'utf8')) as Parameters<
      typeof preparePublicReplyNotification
    >[0];
    const [posture] = await dbRls.execute(sql`
    select pg_backend_pid() as pid, session_user as "sessionUser", current_user as "currentUser",
      s.rolsuper as "sessionSuper", s.rolbypassrls as "sessionBypass",
      c.rolsuper as "currentSuper", c.rolbypassrls as "currentBypass"
    from pg_roles s, pg_roles c where s.rolname=session_user and c.rolname=current_user
  `);
    const result = await preparePublicReplyNotification(params);
    process.stdout.write(
      `S8_REPLY_RESULT ${JSON.stringify({
        ...posture,
        status: result.status,
        ...(result.status === 'skipped' ? { reason: result.reason } : {}),
      })}\n`
    );
  } catch {
    process.stderr.write('Restricted reply fixture failed\n');
    process.exitCode = 1;
  } finally {
    // Both URLs are the same restricted principal; nonproduction reuses this one raw pool.
    await dbAdmin.$client.end({ timeout: 2 });
  }
}
void main();
