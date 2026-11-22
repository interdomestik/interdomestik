import { kickClaimNotificationDeliveries } from '@/lib/claim-notification-delivery-kick';
import { actionFailure } from '@/lib/safe-action';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import type { ChangeClaimStatusResult } from '@interdomestik/domain-claims/claims/change-status';
import { getTranslations } from 'next-intl/server';

type StatusFailure = Extract<ChangeClaimStatusResult, { ok: false }>['code'];

export async function claimStatusActionFailure(code: StatusFailure) {
  const t = await getTranslations('common.claimStatusErrors');
  switch (code) {
    case 'forbidden_role':
      return actionFailure('FORBIDDEN', t('forbidden'));
    case 'not_found':
      return actionFailure('NOT_FOUND', t('notFound'));
    case 'decline_reason_required':
      return actionFailure(code, t('declineReason'));
    case 'draft_not_changeable':
      return actionFailure(code, t('draft'));
    case 'conflict':
      return actionFailure(code, t('conflict'));
    case 'illegal_transition':
      return actionFailure(code, t('transition'));
    default:
      if (code.startsWith('recovery_prerequisite:')) {
        return actionFailure(code, t('recovery'));
      }
      if (code.startsWith('transition_rejected:')) {
        return actionFailure(code, t('evidence'));
      }
      return actionFailure(code, t('failed'));
  }
}

/**
 * After-commit effects of a status change. The command already wrote the change's one
 * `claim.status_changed` audit row in its transaction, so the domain-event audit projection is
 * not activated here: it would write a second row with the same action for the same change.
 */
export async function completeClaimStatusEffects(
  authority: TenantAuthority,
  outcome: Extract<ChangeClaimStatusResult, { ok: true }>
) {
  await kickClaimNotificationDeliveries(authority, outcome.deliveryIds);
}
