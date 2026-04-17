import { sendMemberWelcomeEmail } from '@/lib/email';
import { generateMemberNumber } from '@interdomestik/database/member-number';
import {
  createActiveAnnualMembershipFulfillment,
  createCanonicalMembershipPlanState,
  resolveCanonicalMembershipPlanState,
} from '@interdomestik/domain-membership-billing';
import {
  account,
  agentClients,
  subscriptions,
  user as userTable,
} from '@interdomestik/database/schema';
import { circuitBreakers } from '@interdomestik/shared-utils/circuit-breaker';
import { withTransactionRetry } from '@interdomestik/shared-utils/resilience';
import { hash } from 'bcryptjs';
import { nanoid } from 'nanoid';
import { registerMemberSchema } from './schemas';

type RegisterMemberCoreOptions = {
  membershipMode?: 'direct' | 'sponsored';
};

export async function registerMemberCore(
  agent: { id: string; name?: string | null },
  tenantId: string,
  agentBranchId: string | null,
  formData: FormData,
  options: RegisterMemberCoreOptions = {}
) {
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

  const data = validated.data;
  const userId = nanoid();
  const membershipMode = options.membershipMode ?? 'direct';
  const canonicalPlanState = await resolveCanonicalMembershipPlanState({
    tenantId,
    planId: data.planId,
  });

  try {
    await withTransactionRetry(async tx => {
      const now = new Date();

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
        agentId: agent.id,
        createdAt: now,
        updatedAt: now,
      });

      await tx.insert(account).values({
        id: `${userId}-credential`,
        accountId: data.email,
        providerId: 'credential',
        userId,
        password: await hash(data.password, 10),
        createdAt: now,
        updatedAt: now,
      });

      // 2. Generate and Assign Global Member Number
      // This helper handles the atomic increment and updates the user record
      await generateMemberNumber(tx, {
        userId,
        joinedAt: now,
      });

      await tx.insert(agentClients).values({
        id: nanoid(),
        tenantId,
        agentId: agent.id,
        memberId: userId,
        status: 'active',
        joinedAt: now,
        createdAt: now,
      });

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
        id: nanoid(),
        tenantId,
        branchId: agentBranchId,
        agentId: agent.id,
        userId,
        ...subscriptionValues,
        createdAt: now,
        updatedAt: now,
      });
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
