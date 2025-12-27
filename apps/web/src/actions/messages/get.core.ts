import { getMessagesForClaimCore as getMessagesForClaimCoreDomain } from '@interdomestik/domain-communications/messages/get';
import type { Session } from './context';

export async function getMessagesForClaimCore(params: {
  session: NonNullable<Session> | null;
  claimId: string;
}) {
  return getMessagesForClaimCoreDomain(params);
}
