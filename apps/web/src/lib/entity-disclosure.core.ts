import { db, eq, tenants } from '@interdomestik/database';
import type { InferSelectModel } from 'drizzle-orm';

import type { subscriptions } from '@interdomestik/database';

export type EntityDisclosureSource = 'tenant' | 'subscription';

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

type TenantEntityRecord = Pick<InferSelectModel<typeof tenants>, 'legalName' | 'governingLaw'>;

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
  const tenant = tenantId ? await readTenantEntityRecord(tenantId) : null;
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
  const tenant = legalTenantId ? await readTenantEntityRecord(legalTenantId) : null;

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

async function readTenantEntityRecord(tenantId: string): Promise<TenantEntityRecord | null> {
  // db-access-guard: tenant-scoped -- reason: tenantId/legalTenantId comes from validated session or already tenant-scoped subscription context
  const tenant = await db.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: {
      legalName: true,
      governingLaw: true,
    },
  });
  return tenant ?? null;
}
