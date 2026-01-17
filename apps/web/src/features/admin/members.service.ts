import { db } from '@interdomestik/database';
import { user } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';

export async function findMemberByNumber(memberNumber: string) {
  return db.query.user.findFirst({
    where: eq(user.memberNumber, memberNumber),
    columns: {
      id: true,
    },
  });
}
