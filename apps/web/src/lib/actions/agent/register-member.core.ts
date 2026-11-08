import {
  createAgentAssistedOwnershipAttribution,
  createCanonicalMembershipPlanState,
  resolveCanonicalMembershipPlanState,
  revokeAgentClientReadScope,
} from '@interdomestik/domain-membership-billing';
import { issueTenantMemberNumber } from '@interdomestik/database';
import { subscriptions, user as userTable } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { transactionRetryConfig, withRetry } from '@interdomestik/shared-utils/resilience';
import { nanoid } from 'nanoid';
import { registerMemberSchema } from './schemas';

type RegisterMemberCoreOptions = {
  membershipMode?: 'direct' | 'sponsored';
};

export const DIRECT_REGISTRATION_RETIRED = 'DIRECT_REGISTRATION_RETIRED' as const;

export async function registerMemberCore(
  agent: { id: string; name?: string | null },
  authority: TenantAuthority,
  agentBranchId: string | null,
  formData: FormData,
  options: RegisterMemberCoreOptions = {}
) {
  // A direct registration activated a membership with no payment act and an agent-set password.
  // Members now come only from lead conversion after payment (ACQ-2 D1 a); only the trusted
  // roster import may register, as a paused sponsored membership with no credential.
  if (options.membershipMode !== 'sponsored') {
    return {
      ok: false as const,
      error: 'Direct member registration is retired. Record a lead instead.' as const,
      code: DIRECT_REGISTRATION_RETIRED,
    };
  }

  const { tenantId, principal } = readTenantAuthority(authority);
  const rawData = {
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
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
      error: 'Failed to register member.' as const,
    };
  }

  const data = validated.data;
  const userId = nanoid();
  const subscriptionId = nanoid();
  const canonicalPlanState = await resolveCanonicalMembershipPlanState({
    authority,
    planId: data.planId,
  });
  const attribution = createAgentAssistedOwnershipAttribution(agent.id);

  try {
    const joinedAt = new Date();
    // Each attempt opens its own tenant transaction; the retry wraps the whole attempt.
    const created = await withRetry(
      () =>
        withTenantAuthority(authority, async tx => {
          const now = joinedAt;

          // 1. Create User (Role must be 'member' for the unique index to eventually apply)
          // We insert with null memberNumber first. Email is unique across every tenant, so an
          // address that already has an account creates nothing here and the import reports the
          // row exactly as it reports a new one: the roster is never an account-existence oracle.
          const inserted = await tx
            .insert(userTable)
            .values({
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
            })
            .onConflictDoNothing({ target: userTable.email })
            .returning({ id: userTable.id });
          if (inserted.length === 0) {
            return false;
          }

          await revokeAgentClientReadScope(tx, { tenantId, memberId: userId });

          const subscriptionValues = {
            ...createCanonicalMembershipPlanState(
              canonicalPlanState.planId,
              canonicalPlanState.planKey
            ),
            status: 'paused' as const,
            provider: 'group_sponsor',
            acquisitionSource: 'group_roster_import',
            currentPeriodStart: null,
            currentPeriodEnd: null,
          };

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
          return true;
        }),
      transactionRetryConfig()
    );
    if (!created) {
      return { ok: true as const };
    }

    // The global member number is issued for the committed member. The registration contract
    // allows a member without one (a later sign-in self-heal may assign it), so a failure here does
    // not undo the registration.
    await issueTenantMemberNumber(authority, { userId, joinedAt }).catch(error => {
      console.error('Member number issuance failed:', error);
      return null;
    });

    // No email leaves an import: the employer's roster is not the employee's consent (OD-18). The
    // employee's own acceptance flow replaces this paused registration in ACQ-3b.
    return { ok: true as const };
  } catch (err) {
    console.error('Registration failed:', err);
    return {
      ok: false as const,
      error: 'Failed to register member.' as const,
    };
  }
}
