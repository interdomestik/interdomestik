/** The toast key for a verification decision: a pending membership setup is never shown as done. */
export function verificationToastKey(
  decision: 'approve' | 'reject' | 'needs_info',
  result: object
): string {
  const pending = 'fulfillment' in result && result.fulfillment === 'pending';
  return decision === 'approve' && pending
    ? 'toasts.approve_fulfillment_pending'
    : `toasts.${decision}_success`;
}
