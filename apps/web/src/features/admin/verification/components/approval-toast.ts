/** The toast key for a verification decision: a pending membership setup is never shown as done. */
export function verificationToastKey(
  decision: 'approve' | 'reject' | 'needs_info',
  result: object
): string {
  if (decision !== 'approve') return `toasts.${decision}_success`;
  if ('fulfillment' in result && result.fulfillment === 'pending') {
    return 'toasts.approve_fulfillment_pending';
  }
  // The member exists but their activation email did not go out: History offers a resend.
  if ('invite' in result && result.invite === 'pending') return 'toasts.approve_invite_pending';
  return 'toasts.approve_success';
}

const RESEND_ERROR_TOASTS: Record<string, string> = {
  already_active: 'toasts.resend_invite_already_active',
  cooldown: 'toasts.resend_invite_cooldown',
  delivery_failed: 'toasts.resend_invite_failed',
};

/** The toast key for an activation-invite resend; unknown failures use the generic error. */
export function resendInviteToastKey(result: { success: boolean; error?: string }): string {
  if (result.success) return 'toasts.resend_invite_success';
  return RESEND_ERROR_TOASTS[result.error ?? ''] ?? 'toasts.error';
}
