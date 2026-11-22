import type { TenantTransaction } from '@interdomestik/database';
import { resolveRecipientLocale } from '../recipient-locale';
import { enqueueClaimInboxNotification } from './in-app';

export async function enqueueSupportHandoffResponseNotification(
  tx: TenantTransaction,
  tenantId: string,
  memberId: string,
  handoff: { id: string; responseVersion: number }
) {
  const locale = await resolveRecipientLocale(tx, tenantId, memberId);
  await enqueueClaimInboxNotification(tx, {
    id: `ntf_support_handoff_${tenantId}_${handoff.id}_${handoff.responseVersion}`,
    type: 'support_handoff_public_response',
    title: 'Staff update available',
    content: 'A staff update is available on your support request.',
    actionUrl: `/${locale}/member/help?handoffId=${encodeURIComponent(handoff.id)}`,
    userId: memberId,
    tenantId,
  });
}
