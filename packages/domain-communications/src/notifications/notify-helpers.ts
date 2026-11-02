import { withTenantContext } from '@interdomestik/database';
import { withTenant } from '@interdomestik/database/tenant-security';
import { sendEmail } from '../email';
import { buildEmailTemplate, joinUrl, DEFAULT_APP_URL } from '../email/templates';
import type { NotificationEvent } from './notify-types';

export function queryUserById(userId: string, tenantId: string) {
  return withTenantContext({ tenantId }, tx =>
    tx.query.user.findFirst({
      where: (users, { eq }) => withTenant(tenantId, users.tenantId, eq(users.id, userId)),
      columns: { email: true, emailVerified: true, tenantId: true },
    })
  );
}

export function sendVerifiedEmail(
  userId: string,
  tenantId: string,
  label: string,
  dispatch: (verifiedEmail: string) => Promise<unknown>
) {
  queryUserById(userId, tenantId)
    .then(userRecord => {
      if (!userRecord?.email || !userRecord.emailVerified) {
        return;
      }

      return dispatch(userRecord.email);
    })
    .catch(error => console.error(`Failed to send ${label} email:`, error));
}

export function sendLifecycleEmail(
  to: string,
  props: {
    title: string;
    intro: string;
    actionUrl: string;
    ctaLabel?: string;
    details?: string[];
  }
) {
  if (!to) return Promise.resolve({ success: false as const, error: 'Missing recipient email' });

  return sendEmail(
    to,
    buildEmailTemplate({
      title: props.title,
      intro: props.intro,
      details: props.details,
      ctaLabel: props.ctaLabel ?? 'Open Interdomestik',
      ctaUrl: joinUrl(DEFAULT_APP_URL, props.actionUrl),
    })
  );
}

export function resolveNotificationContent(
  event: NotificationEvent,
  payload: Record<string, string | number | boolean>,
  override?: string
) {
  if (override) {
    return override;
  }

  return payload.claimTitle ? `Update on: ${payload.claimTitle}` : `New update: ${event}`;
}
