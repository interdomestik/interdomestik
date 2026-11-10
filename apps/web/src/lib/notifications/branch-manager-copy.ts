import { getTranslations } from 'next-intl/server';
import { DEFAULT_LOCALE } from '@/i18n/locales';

const eventKeys = {
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
} as const;

/** Only trusted event-type keys reach the catalog. Unknown stored types use neutral copy. */
export async function getBranchManagerNotificationCopy(event: string, locale?: string) {
  const t = await getTranslations({
    locale: locale ?? DEFAULT_LOCALE,
    namespace: 'notifications.branchManager',
  });
  const key = Object.hasOwn(eventKeys, event)
    ? eventKeys[event as keyof typeof eventKeys]
    : 'unknown';
  return { title: t(`${key}.title`), content: t(`${key}.content`) };
}
