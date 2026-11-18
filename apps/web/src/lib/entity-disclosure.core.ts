import {
  and,
  eq,
  legalEntities,
  type subscriptions,
  type TenantTransaction,
} from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { readTenantLegalMetadata } from '@interdomestik/database/tenant-directory';
import type { InferSelectModel } from 'drizzle-orm';

export type EntityDisclosureSource = 'tenant' | 'subscription' | 'sponsor';

export type EntityDisclosureModel = {
  contractingCompany: string | null;
  governingLaw: string | null;
  unavailable: boolean;
  source: EntityDisclosureSource;
};

type SubscriptionEntityInput = Pick<
  InferSelectModel<typeof subscriptions>,
  'tenantId' | 'legalTenantId' | 'governingLawSnapshot'
>;

export function buildEntityDisclosureModel(args: {
  contractingCompany?: string | null;
  governingLaw?: string | null;
  source: EntityDisclosureSource;
}): EntityDisclosureModel {
  const contractingCompany = normalizeDisclosureValue(args.contractingCompany);
  const governingLaw = normalizeDisclosureValue(args.governingLaw);

  return {
    contractingCompany,
    governingLaw,
    unavailable: !contractingCompany || !governingLaw,
    source: args.source,
  };
}

export async function getTenantEntityDisclosureCore(
  tenantId: string | null | undefined
): Promise<EntityDisclosureModel> {
  const tenant = tenantId ? await readTenantLegalMetadata(tenantId) : null;
  return buildEntityDisclosureModel({
    contractingCompany: tenant?.legalName,
    governingLaw: tenant?.governingLaw,
    source: 'tenant',
  });
}

export async function getSubscriptionEntityDisclosureCore(
  subscription: SubscriptionEntityInput | null | undefined
): Promise<EntityDisclosureModel> {
  const legalTenantId = subscription?.legalTenantId ?? subscription?.tenantId ?? null;
  const tenant = legalTenantId ? await readTenantLegalMetadata(legalTenantId) : null;

  return buildEntityDisclosureModel({
    contractingCompany: tenant?.legalName,
    governingLaw: subscription?.governingLawSnapshot ?? tenant?.governingLaw,
    source: 'subscription',
  });
}

function normalizeDisclosureValue(value: string | null | undefined): string | null {
  const normalized = value?.trim();
  return normalized || null;
}

export async function getSponsorEntityDisclosureCore(
  authority: TenantAuthority,
  legalEntityId: string
): Promise<EntityDisclosureModel> {
  const { tenantId } = readTenantAuthority(authority);
  return withTenantAuthority(authority, tx =>
    readSponsorEntityDisclosure(tx, tenantId, legalEntityId)
  );
}

/** Reads inside the caller's transaction: a second transaction would need a second connection. */
export async function readSponsorEntityDisclosure(
  tx: TenantTransaction,
  tenantId: string,
  legalEntityId: string
): Promise<EntityDisclosureModel> {
  const entity = await tx.query.legalEntities.findFirst({
    where: and(eq(legalEntities.tenantId, tenantId), eq(legalEntities.id, legalEntityId)),
  });
  return buildEntityDisclosureModel({
    contractingCompany: entity?.legalName,
    governingLaw: entity?.governingLaw,
    source: 'sponsor',
  });
}
