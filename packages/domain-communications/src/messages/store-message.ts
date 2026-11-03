import { createHash } from 'node:crypto';
import { claimMessages, type TenantTransaction } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';

export const MESSAGE_KEY_CONFLICT_ERROR = 'Message key already used for a different message';

export type ClaimMessageValues = {
  tenantId: string;
  claimId: string;
  senderId: string;
  content: string;
  isInternal: boolean;
};

export type StoreMessageResult =
  { success: true; messageId: string; replayed: boolean } | { success: false; error: string };

/**
 * The id of a keyed message is derived from its tenant, sender and client key, so the primary key
 * admits each key once per sender without a schema change and no caller can choose a row id.
 */
export function keyedMessageId(
  tenantId: string,
  senderId: string,
  clientMessageId: string
): string {
  const digest = createHash('sha256')
    .update(JSON.stringify([tenantId, senderId, clientMessageId]))
    .digest('base64url');
  return `msg_${digest}`;
}

/**
 * Persists one claim message inside the caller's tenant transaction. A resent client key replays
 * the stored message when it carries the same claim, audience and content, and fails closed otherwise.
 */
export async function storeClaimMessage(
  tx: TenantTransaction,
  values: ClaimMessageValues,
  clientMessageId: string | null
): Promise<StoreMessageResult> {
  if (clientMessageId === null) {
    const id = nanoid();
    // db-access-guard: tenant-scoped -- reason: tenantId from the validated authority before insert
    await tx.insert(claimMessages).values({ ...values, id });
    return { success: true, messageId: id, replayed: false };
  }

  const id = keyedMessageId(values.tenantId, values.senderId, clientMessageId);
  // db-access-guard: tenant-scoped -- reason: tenantId from the validated authority before insert
  const inserted = await tx
    .insert(claimMessages)
    .values({ ...values, id })
    .onConflictDoNothing({ target: claimMessages.id })
    .returning({ id: claimMessages.id });
  if (inserted.length > 0) {
    return { success: true, messageId: id, replayed: false };
  }

  const [existing] = await tx
    .select({
      senderId: claimMessages.senderId,
      claimId: claimMessages.claimId,
      content: claimMessages.content,
      isInternal: claimMessages.isInternal,
    })
    .from(claimMessages)
    .where(withTenant(values.tenantId, claimMessages.tenantId, eq(claimMessages.id, id)))
    .limit(1);

  const sameMessage =
    existing?.senderId === values.senderId &&
    existing.claimId === values.claimId &&
    existing.content === values.content &&
    (existing.isInternal ?? false) === values.isInternal;
  return sameMessage
    ? { success: true, messageId: id, replayed: true }
    : { success: false, error: MESSAGE_KEY_CONFLICT_ERROR };
}
