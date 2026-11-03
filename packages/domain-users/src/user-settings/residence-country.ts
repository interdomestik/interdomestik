import {
  and,
  appendEvent,
  claims,
  desc,
  eq,
  inArray,
  subscriptions,
  user,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenant } from '@interdomestik/database/tenant-security';
import { nanoid } from 'nanoid';

import type { UserDomainDeps, UserSession } from '../types';
import {
  decideResidenceCountryChange,
  isPersistedResidenceChangeDecision,
  residenceChangeEventPayload,
  residenceCountryChangeSchema,
  type ResidenceChangeDecision,
} from './residence-country-policy';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

// T-507 defines active recovery as non-terminal recovery work already in negotiation or court.
const ACTIVE_RECOVERY_STATES = ['negotiation', 'court'] as const;

type ResidenceChangeResult =
  | { success: true; decision: ResidenceChangeDecision; eventId: string | null }
  | { success: false; error: string };

function isMemberRole(role: string | null | undefined): boolean {
  return role === 'member' || role === 'user';
}

export async function updateResidenceCountryCore(
  params: {
    residenceCountry: unknown;
    session: UserSession | null;
    authority: TenantAuthority | null;
  },
  deps: UserDomainDeps = {}
): Promise<ResidenceChangeResult> {
  const { session, authority } = params;
  if (!session?.user || !authority) return { success: false, error: 'Unauthorized' };
  if (!isMemberRole(session.user.role)) return { success: false, error: 'Forbidden' };

  const parsed = residenceCountryChangeSchema.safeParse({
    residenceCountry: params.residenceCountry,
  });
  if (!parsed.success) {
    return {
      success: false,
      error: `Validation failed: ${parsed.error.issues[0]?.message ?? 'Invalid input'}`,
    };
  }

  let tenantId: string;
  try {
    tenantId = readTenantAuthority(authority).tenantId;
  } catch {
    return { success: false, error: 'Unauthorized' };
  }

  try {
    const result = await withTenantAuthority(authority, async tx => {
      const [userRow] = await tx
        .select({ residenceCountry: user.residenceCountry })
        .from(user)
        .where(withTenant(tenantId, user.tenantId, eq(user.id, session.user.id)))
        .limit(1);
      if (!userRow) return { success: false as const, error: 'User not found' };

      const [subscriptionRow] = await tx
        .select({ termsVersionAccepted: subscriptions.termsVersionAccepted })
        .from(subscriptions)
        .where(
          withTenant(tenantId, subscriptions.tenantId, eq(subscriptions.userId, session.user.id))
        )
        .orderBy(desc(subscriptions.updatedAt), desc(subscriptions.createdAt))
        .limit(1);

      const activeRecoveryClaims = await tx
        .select({ id: claims.id })
        .from(claims)
        .where(
          withTenant(
            tenantId,
            claims.tenantId,
            and(
              eq(claims.userId, session.user.id),
              inArray(claims.recoveryLifecycleState, ACTIVE_RECOVERY_STATES)
            )
          )
        );

      const decision = decideResidenceCountryChange({
        activeRecoveryClaimCount: activeRecoveryClaims.length,
        fromResidenceCountry: userRow.residenceCountry ?? null,
        termsVersionAccepted: subscriptionRow?.termsVersionAccepted ?? null,
        toResidenceCountry: parsed.data.residenceCountry,
      });

      if (decision.changeState === 'unchanged') {
        return { success: true as const, decision, eventId: null };
      }
      if (!isPersistedResidenceChangeDecision(decision)) {
        throw new Error(`Unexpected residence-change decision state: ${decision.changeState}`);
      }

      // db-access-guard: tenant-scoped -- reason: residence-country update constrains the signed-in user by validated session tenant and user id
      await tx
        .update(user)
        .set({ residenceCountry: parsed.data.residenceCountry, updatedAt: new Date() })
        .where(withTenant(tenantId, user.tenantId, eq(user.id, session.user.id)));

      const event = await appendEvent(tx, {
        actor: { id: session.user.id, role: session.user.role },
        aggregateVersion: 0,
        correlationId: nanoid(),
        entity: { id: session.user.id, type: 'member' },
        eventName: 'member.residence_country_changed',
        eventVersion: 1,
        payload: residenceChangeEventPayload(decision),
        tenantId,
      });

      return { success: true as const, decision, eventId: event.id };
    });

    if (result.success && result.eventId) {
      try {
        await deps.logAuditEvent?.({
          actorId: session.user.id,
          actorRole: session.user.role,
          action: 'member.residence_country_changed',
          entityId: session.user.id,
          entityType: 'member',
          metadata: result.decision,
          authority,
        });
      } catch (auditError) {
        console.error('Failed to log residence-country audit event:', auditError);
      }
    }

    return result;
  } catch (error) {
    console.error('Failed to update residence country:', error);
    return { success: false, error: 'Failed to update residence country' };
  }
}
