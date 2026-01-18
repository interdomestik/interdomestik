import { db } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import { and, eq } from 'drizzle-orm';

export async function findMemberByNumber(memberNumber: string, tenantId: string) {
  return db.query.user.findFirst({
    where: and(eq(user.memberNumber, memberNumber), eq(user.tenantId, tenantId)),
    columns: {
      id: true,
    },
  });
}
