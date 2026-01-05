import { getMessagesForClaimCore as getMessagesForClaimCoreDomain } from '@interdomestik/domain-communications/messages/get';
import { getMessagesSchema } from '@interdomestik/domain-communications/messages/schemas';
import type { Session } from './context';

export async function getMessagesForClaimCore(params: {
  session: NonNullable<Session> | null;
  claimId: string;
}) {
  const validation = getMessagesSchema.safeParse({ claimId: params.claimId });
  if (!validation.success) {
    const error = validation.error.flatten().fieldErrors.claimId?.[0] || 'Invalid input';
    return { success: false, error };
  }

  return getMessagesForClaimCoreDomain(params);
}
