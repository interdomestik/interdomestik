import type { db } from '@interdomestik/database';

export type HandoffTx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export type HandoffClaimRow = {
  branchId: string | null;
  incidentCountryCode: string | null;
  lifecycleVersion: number;
  recoveryLegalTenantId: string | null;
  staffId: string | null;
};

export type TrustedGrantActorSnapshot = {
  role: string;
  tenantId: string;
};

export type TrustedGrantActorResolver = (args: {
  actorId: string;
  recoveryTenantId: string;
  tx: HandoffTx;
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
