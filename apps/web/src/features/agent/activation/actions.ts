'use server';

import { activateAgentUserProfile } from '@/features/agent/activation/server/activate-agent-profile';
import { auth } from '@/lib/auth';
import { ensureTenantId } from '@interdomestik/shared-auth';
import { randomBytes } from 'crypto';
import { revalidatePath } from 'next/cache';
import { headers } from 'next/headers';

export async function activateAgentProfile() {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user) {
    return { success: false, error: 'Unauthorized' };
  }

  // Idempotency check: If already agent, just return success
  if (session.user.role === 'agent') {
    return {
      success: true,
      referralCode: session.user.referralCode,
      alreadyActive: true,
    };
  }

  // Generate Referral Code: FIRSTNAME-RANDOM (e.g. ARBEN-9X2)
  // Ensure we have a valid name, fallback to 'MEMBER'
  const cleanName = (session.user.name || 'MEMBER')
    .split(' ')[0]
    .toUpperCase()
    .replace(/[^A-Z]/g, '');

  const baseName = cleanName.length > 0 ? cleanName : 'AGENT';
  const suffix = randomBytes(2).toString('hex').toUpperCase();
  const code = `${baseName}-${suffix}`;

  try {
    const tenantId = ensureTenantId(session);
    // Transactional safety: In a real scenario with high concurrency,
    // we might want a loop to handle code collision (unique constraint),
    // but with 4 chars hex suffix (65k combinations per name), collision is rare enough for now.

    await activateAgentUserProfile({
      currentRole: session.user.role,
      referralCode: code,
      tenantId,
      userId: session.user.id,
    });

    revalidatePath('/', 'layout'); // Revalidate everything to update sidebar/nav

    return { success: true, referralCode: code };
  } catch (error) {
    console.error('[AgentActivation] Failed:', error);
    return { success: false, error: 'Failed to activate agent profile. Please try again.' };
  }
}
