export const NOTIFICATION_EVENT_KEYS: Readonly<Record<string, string>> = {
  claim_submitted: 'claimSubmitted',
  claim_assigned: 'claimAssigned',
  claim_status_changed: 'statusChanged',
  claim_pack_generated: 'claimPackGenerated',
  claim_pack_upgraded: 'claimPackUpgraded',
  document_requested: 'documentRequested',
  triage_complete: 'triageComplete',
  escalation_accepted: 'escalationAccepted',
  escalation_declined: 'escalationDeclined',
  new_message: 'newMessage',
  sla_warning: 'slaWarning',
  sla_breached: 'slaBreached',
  membership_renewal: 'membershipRenewal',
  payment_verification_update: 'paymentVerificationUpdate',
  support_handoff_public_response: 'supportHandoffPublicResponse',
};

type StoredNotification = Readonly<{ type: string; content: string; actionUrl: string | null }>;
type Translate = (key: string, values?: Record<string, string>) => string;

/** Read only a claim route identifier, never an external URL or a query parameter. */
export function notificationClaimId(notification: StoredNotification): string | null {
  if (!Object.hasOwn(NOTIFICATION_EVENT_KEYS, notification.type)) return null;
  return (
    notification.actionUrl?.match(
      /^\/(?:[a-z]{2}\/)?(?:member|dashboard|agent|staff|admin)\/claims\/([^/?#]+)(?:[?#].*)?$/
    )?.[1] ?? null
  );
}

export function storedClaimLabel(notification: StoredNotification): string | null {
  const label = notification.content.startsWith('Update on: ')
    ? notification.content.slice('Update on: '.length).trim()
    : '';
  if (!label || label === notificationClaimId(notification)) return null;
  // Some legacy producers stored a thread identifier as the claim title.
  if (/^(?:xtenant-|member-comms-|golden_|[\da-f]{8}-[\da-f]{4}-)/i.test(label)) return null;
  return label;
}

export function notificationDisplayCopy(
  notification: StoredNotification,
  t: Translate,
  resolvedClaimLabel?: string | null
): { title: string; content: string } {
  const event = Object.hasOwn(NOTIFICATION_EVENT_KEYS, notification.type)
    ? NOTIFICATION_EVENT_KEYS[notification.type]
    : 'unknown';
  const claimId = notificationClaimId(notification);
  const label = resolvedClaimLabel || storedClaimLabel(notification);
  return {
    title: t(`events.${event}.title`),
    content: claimId ? t('updateOn', { claim: label || t('yourClaim') }) : t('updateBody'),
  };
}
