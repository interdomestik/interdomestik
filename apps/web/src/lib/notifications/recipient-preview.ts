import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { getBranchManagerNotificationCopy } from './branch-manager-copy';
import { getNotificationRecipientRole } from './recipient-role';

/** Resolve trusted copy before the last role read, with no asynchronous gap before the caller dispatches. */
export async function resolveRecipientPreview(
  authority: TenantAuthority,
  recipientId: string,
  event: string
) {
  const copy = await getBranchManagerNotificationCopy(event).catch(() => null);
  const role = await getNotificationRecipientRole(authority, recipientId).catch(() => null);
  if (!role || (deniesClaimMessageContent(role) && !copy)) return null;
  return { copy: deniesClaimMessageContent(role) ? copy : null };
}
