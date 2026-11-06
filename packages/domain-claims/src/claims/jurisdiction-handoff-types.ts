import type { db } from '@interdomestik/database';

export type HandoffTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type HandoffClaimRow = {
  branchId: string | null;
  caseLifecycleState: string | null;
  incidentCountryCode: string | null;
  lifecycleVersion: number;
  recoveryLegalTenantId: string | null;
  staffId: string | null;
};

export type TrustedGrantActorSnapshot = {
  role: string;
  tenantId: string;
};

/**
 * Reads the grant actor's tenant and role from a trusted source. It receives identifiers only and
 * opens its own authorized recovery-tenant read: the handoff transaction runs under the home
 * tenant, so it cannot establish recovery-tenant visibility, and it is never lent to the resolver.
 * A separate read is not atomic with the grant insert; before a production caller adopts this,
 * concurrent actor removal or role change must be shown unable to create an invalid grant.
 */
export type TrustedGrantActorResolver = (args: {
  actorId: string;
  recoveryTenantId: string;
}) => Promise<TrustedGrantActorSnapshot | null>;

export type JurisdictionHandoffParams = {
  actor: { branchId?: string | null; id: string; role: string };
  claimId: string;
  correlationId?: string;
  grantActorId: string;
  grantActorResolver: TrustedGrantActorResolver;
  grantExpiresAt?: Date | null;
  homeTenantId: string;
  now?: Date;
};
