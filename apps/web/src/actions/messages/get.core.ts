import { getMessagesForClaimCore as getMessagesForClaimCoreDomain } from '@interdomestik/domain-communications/messages/get';
import { getMessagesSchema } from '@interdomestik/domain-communications/messages/schemas';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { readTenantAuthority } from '@interdomestik/database/tenant-authority';
import type { Session } from './context';

export async function getMessagesForClaimCore(params: {
  session: NonNullable<Session> | null;
  authority: TenantAuthority | null;
  claimId: string;
}): Promise<Awaited<ReturnType<typeof getMessagesForClaimCoreDomain>>> {
  // Both mounted action families share this boundary. Never enter the content reader for BM.
  if (deniesClaimMessageContent(params.session?.user.role)) {
    return { success: false, error: 'Access denied' };
  }
  if (params.authority) {
    try {
      if (deniesClaimMessageContent(readTenantAuthority(params.authority).principal?.role)) {
        return { success: false, error: 'Access denied' };
      }
    } catch {
      return { success: false, error: 'Unauthorized' };
    }
  }
  const validation = getMessagesSchema.safeParse({ claimId: params.claimId });
  if (!validation.success) {
    const error = validation.error.format().claimId?._errors[0] || 'Invalid input';
    return { success: false, error };
  }

  return getMessagesForClaimCoreDomain(params);
}
