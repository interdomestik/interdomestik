import { sendMemberWelcomeEmail } from '@/lib/email';
import { generateMemberNumber } from '@interdomestik/database/member-number';
import {
  createActiveAnnualMembershipFulfillment,
  createAgentAssistedOwnershipAttribution,
  createCanonicalMembershipPlanState,
  resolveCanonicalMembershipPlanState,
  revokeAgentClientReadScope,
} from '@interdomestik/domain-membership-billing';
import { account, subscriptions, user as userTable } from '@interdomestik/database/schema';
import { circuitBreakers } from '@interdomestik/shared-utils/circuit-breaker';
import { withRetry } from '@interdomestik/shared-utils/resilience';
import { dbAdmin } from '@interdomestik/database/db';
import { and, eq } from 'drizzle-orm';
import { branches } from '@interdomestik/database/schema';
import { hash } from 'bcryptjs';
import { nanoid } from 'nanoid';
import { registerMemberSchema } from '@/lib/actions/agent/schemas';

type RegisterMemberCoreOptions = {
  membershipMode?: 'direct' | 'sponsored';
};

export async function registerAgentMemberBootstrap(
  agent: { id: string; name?: string | null },
  tenantId: string,
  agentBranchId: string | null,
  formData: FormData,
  options: RegisterMemberCoreOptions = {}
) {
  if (!tenantId?.trim() || !agent.id?.trim()) {
    return { ok: false as const, error: 'Unauthorized registration context' };
  }
  if (
    options.membershipMode !== undefined &&
    !['direct', 'sponsored'].includes(options.membershipMode)
  ) {
    return { ok: false as const, error: 'Invalid membership mode' };
  }
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
  const attribution = createAgentAssistedOwnershipAttribution(agent.id);

  try {
    await withRetry(
      () =>
        dbAdmin.transaction(async tx => {
          // Fixed auth-bootstrap capability: no transaction or callback escapes this function.
          const [persistedAgent] = await tx
            .select({
              id: userTable.id,
              role: userTable.role,
              tenantId: userTable.tenantId,
              branchId: userTable.branchId,
            })
            .from(userTable)
            .where(eq(userTable.id, agent.id))
            .for('share');
          if (
            !persistedAgent ||
            persistedAgent.role !== 'agent' ||
            persistedAgent.tenantId !== tenantId ||
            (persistedAgent.branchId ?? null) !== agentBranchId
          ) {
            throw new Error('Unauthorized registration context');
          }
          if (agentBranchId) {
            const [branch] = await tx
              .select({ id: branches.id })
              .from(branches)
              .where(and(eq(branches.id, agentBranchId), eq(branches.tenantId, tenantId)))
              .for('share');
            if (!branch) throw new Error('Unauthorized registration branch');
          }
          const canonicalPlanState = await resolveCanonicalMembershipPlanState(
            { tenantId, planId: data.planId },
            tx
          );
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
            ...attribution,
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
            id: nanoid(),
            tenantId,
            branchId: agentBranchId,
            agentId: agent.id,
            userId,
            ...subscriptionValues,
            createdAt: now,
            updatedAt: now,
          });
        }),
      {
        retryableErrors: [
          'deadlock detected',
          'could not serialize access',
          'tuple simultaneously updated',
        ],
      }
    );

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
