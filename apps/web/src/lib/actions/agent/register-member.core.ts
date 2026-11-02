import { sendMemberWelcomeEmail } from '@/lib/email';
import {
  createActiveAnnualMembershipFulfillment,
  createAgentAssistedOwnershipAttribution,
  createCanonicalMembershipPlanState,
  resolveCanonicalMembershipPlanState,
  revokeAgentClientReadScope,
} from '@interdomestik/domain-membership-billing';
import {
  appendTenantMemberCredential,
  hasTenantMemberCredential,
  issueTenantMemberNumber,
} from '@interdomestik/database';
import { subscriptions, user as userTable } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { circuitBreakers } from '@interdomestik/shared-utils/circuit-breaker';
import { withTransactionRetry } from '@interdomestik/shared-utils/resilience';
import { hash } from 'bcryptjs';
import { nanoid } from 'nanoid';
import { registerMemberSchema } from './schemas';

type RegisterMemberCoreOptions = {
  membershipMode?: 'direct' | 'sponsored';
};

type CredentialOutcome = 'attached' | 'refused' | 'unknown';

type RegistrationAttempt = {
  authority: TenantAuthority;
  userId: string;
  email: string;
  passwordHash: string;
};

// The credential is identity data the tenant transaction cannot write, so it is attached by the
// fixed kernel append after that transaction commits. Only a returned refusal proves no credential
// was written; a thrown append may have committed before its acknowledgement was lost, so it is
// re-read, and an unreadable outcome stays unknown.
async function attachCredential(attempt: RegistrationAttempt): Promise<CredentialOutcome> {
  try {
    const attached = await appendTenantMemberCredential(attempt.authority, {
      userId: attempt.userId,
      email: attempt.email,
      passwordHash: attempt.passwordHash,
    });
    return attached ? 'attached' : 'refused';
  } catch (error) {
    console.error('Member credential append failed:', error);
    try {
      return (await hasTenantMemberCredential(attempt.authority, attempt.userId))
        ? 'attached'
        : 'unknown';
    } catch (recheckError) {
      console.error('Member credential recheck failed:', recheckError);
      return 'unknown';
    }
  }
}

export async function registerMemberCore(
  agent: { id: string; name?: string | null },
  authority: TenantAuthority,
  agentBranchId: string | null,
  formData: FormData,
  options: RegisterMemberCoreOptions = {}
) {
  const { tenantId, principal } = readTenantAuthority(authority);
  const rawData = {
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    password: formData.get('password'),
    planId: formData.get('planId'),
    notes: formData.get('notes') || undefined,
  };

  const validated = registerMemberSchema.safeParse(rawData);

  if (!validated.success) {
    return {
      ok: false as const,
      error: 'Validation failed' as const,
      fields: validated.error.flatten().fieldErrors, // NOSONAR
    };
  }

  // The registering agent is the authority's own principal, not a second, independent session read.
  if (principal?.userId !== agent.id || principal.role !== 'agent') {
    console.error('Registration refused: agent does not match the tenant authority principal');
    return {
      ok: false as const,
      error: 'Failed to register member. Email might already exist.' as const,
    };
  }

  const data = validated.data;
  const userId = nanoid();
  const subscriptionId = nanoid();
  const membershipMode = options.membershipMode ?? 'direct';
  const canonicalPlanState = await resolveCanonicalMembershipPlanState({
    authority,
    planId: data.planId,
  });
  const attribution = createAgentAssistedOwnershipAttribution(agent.id);

  try {
    const passwordHash = await hash(data.password, 10);
    const joinedAt = new Date();
    await withTransactionRetry(
      async tx => {
        const now = joinedAt;

        // 1. Create User (Role must be 'member' for the unique index to eventually apply)
        // We insert with null memberNumber first.
        await tx.insert(userTable).values({
          id: userId,
          tenantId,
          branchId: agentBranchId,
          name: data.fullName,
          email: data.email,
          emailVerified: false,
          role: 'member', // Critical change: was 'user'
          ...attribution,
          createdAt: now,
          updatedAt: now,
        });

        await revokeAgentClientReadScope(tx, { tenantId, memberId: userId });

        const subscriptionValues =
          membershipMode === 'sponsored'
            ? {
                ...createCanonicalMembershipPlanState(
                  canonicalPlanState.planId,
                  canonicalPlanState.planKey
                ),
                status: 'paused' as const,
                provider: 'group_sponsor',
                acquisitionSource: 'group_roster_import',
                currentPeriodStart: null,
                currentPeriodEnd: null,
              }
            : createActiveAnnualMembershipFulfillment(
                canonicalPlanState.planId,
                now,
                canonicalPlanState.planKey
              );

        await tx.insert(subscriptions).values({
          id: subscriptionId,
          tenantId,
          branchId: agentBranchId,
          agentId: agent.id,
          userId,
          ...subscriptionValues,
          createdAt: now,
          updatedAt: now,
        });
      },
      {},
      { authority }
    );

    // Without a credential the committed registration is left in place for recovery, never
    // withdrawn: a refusal means another writer changed the member (or gave it an account) after
    // this transaction committed, and nothing proves the rows are still only this attempt's.
    const credential = await attachCredential({
      authority,
      userId,
      email: data.email,
      passwordHash,
    });
    if (credential !== 'attached') {
      console.error(
        `Registration ${userId} left pending for recovery (credential outcome: ${credential})`
      );
      throw new Error('Member credential was not attached');
    }

    // The global member number is issued for the committed member. The registration contract
    // allows a member without one (a later sign-in self-heal may assign it), so a failure here does
    // not undo the registration.
    await issueTenantMemberNumber(authority, { userId, joinedAt }).catch(error => {
      console.error('Member number issuance failed:', error);
      return null;
    });

    // Send email with circuit breaker protection
    try {
      await circuitBreakers.email.execute(() =>
        sendMemberWelcomeEmail(data.email, {
          memberName: data.fullName,
          agentName: agent.name || 'Your Agent',
        })
      );
    } catch (emailError) {
      // Don't fail registration if email fails, just log it
      console.warn('Welcome email failed:', emailError);
    }

    return { ok: true as const };
  } catch (err) {
    console.error('Registration failed:', err);
    return {
      ok: false as const,
      error: 'Failed to register member. Email might already exist.' as const,
    };
  }
}
