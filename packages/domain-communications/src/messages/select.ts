import { claimMessages, user, type TenantTransaction } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { eq, type SQL } from 'drizzle-orm';

export function selectMessagesWithSender(
  tx: TenantTransaction,
  tenantId: string,
  condition: SQL | undefined
) {
  return tx
    .select({
      id: claimMessages.id,
      claimId: claimMessages.claimId,
      senderId: claimMessages.senderId,
      content: claimMessages.content,
      isInternal: claimMessages.isInternal,
      readAt: claimMessages.readAt,
      createdAt: claimMessages.createdAt,
      sender: {
        id: user.id,
        name: user.name,
        image: user.image,
        role: user.role,
      },
    })
    .from(claimMessages)
    .leftJoin(user, eq(claimMessages.senderId, user.id))
    .where(withTenant(tenantId, claimMessages.tenantId, condition));
}
