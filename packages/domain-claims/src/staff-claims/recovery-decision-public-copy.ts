import type { MemberRecoveryDeclineReasonCode, RecoveryDeclineReasonCode } from './types';

/** Keep a sensitive internal category out of member-facing decision data. */
export function toMemberDeclineReasonCode(
  code: RecoveryDeclineReasonCode
): MemberRecoveryDeclineReasonCode {
  if (code === 'conflict_or_integrity_concern') {
    return 'other';
  }
  return code;
}

/** A caller-supplied note must not reveal the sensitive reason on the public timeline. */
export function selectPublicDeclineNote(
  code: RecoveryDeclineReasonCode,
  requestedNote: string | null | undefined,
  safeDefault: string
): string {
  if (code === 'conflict_or_integrity_concern') {
    return safeDefault;
  }
  const trimmed = requestedNote?.trim();
  return trimmed || safeDefault;
}
