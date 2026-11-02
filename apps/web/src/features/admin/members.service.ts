import { user } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { and, eq } from 'drizzle-orm';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

export async function findMemberByNumber(memberNumber: string, authority: TenantAuthority) {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx =>
    tx.query.user.findFirst({
      where: and(eq(user.memberNumber, memberNumber), eq(user.tenantId, tenantId)),
      columns: {
        id: true,
      },
    })
  );
}
