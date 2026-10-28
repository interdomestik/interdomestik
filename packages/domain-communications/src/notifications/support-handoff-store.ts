import { withTenantContext, notifications, user } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, eq, like } from 'drizzle-orm';

export async function notifySupportHandoffPublicResponse(
  memberId: string,
  handoff: { id: string; publicResponseVersion: number },
  options: {
    actionUrl?: string;
    content?: string;
    tenantId: string;
    title?: string;
  }
) {
  try {
    return await withTenantContext({ tenantId: options.tenantId }, async tx => {
      const recipient = await tx.query.user.findFirst({
        where: withTenant(options.tenantId, user.tenantId, eq(user.id, memberId)),
        columns: { id: true, tenantId: true },
      });
      if (!recipient?.tenantId)
        return { success: false, error: 'Missing tenantId for notification' };
      await tx
        .insert(notifications)
        .values({
          id: `ntf_support_handoff_${options.tenantId}_${handoff.id}_${handoff.publicResponseVersion}`,
          tenantId: recipient.tenantId,
          userId: memberId,
          type: 'support_handoff_public_response',
          title: options.title ?? 'Staff update available',
          content:
            (options.content ?? 'A staff update is available on your support request.') ||
            'New update: support_handoff_public_response',
          actionUrl: (options.actionUrl ?? '/member/help') || null,
          isRead: false,
        })
        .onConflictDoNothing({ target: notifications.id });
      return { success: true };
    });
  } catch (error) {
    console.error('Failed to create in-app notification [support_handoff_public_response]:', error);
    return { success: false, error: 'Database error' };
  }
}

export async function clearSupportHandoffPublicResponseNotifications(
  memberId: string,
  handoff: { id: string },
  options: { tenantId: string }
) {
  try {
    await withTenantContext({ tenantId: options.tenantId }, tx =>
      tx
        .delete(notifications)
        .where(
          withTenant(
            options.tenantId,
            notifications.tenantId,
            and(
              eq(notifications.userId, memberId),
              eq(notifications.type, 'support_handoff_public_response'),
              like(notifications.id, `ntf_support_handoff_${options.tenantId}_${handoff.id}_%`)
            )
          )
        )
    );
    return { success: true };
  } catch (error) {
    console.error('Failed to clear support handoff public response notifications:', error);
    return { success: false, error: 'Database error' };
  }
}
