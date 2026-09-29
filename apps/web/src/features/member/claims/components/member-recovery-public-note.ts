const SENSITIVE_DECLINE_PUBLIC_NOTE = 'We cannot accept this matter for staff-led recovery.';

export function localizeMemberRecoveryPublicNote(
  description: string | null | undefined,
  translate: (key: string) => string
): string | null | undefined {
  return description?.trim() === SENSITIVE_DECLINE_PUBLIC_NOTE
    ? translate('detail.recoveryDecision.reasons.other.description')
    : description;
}
