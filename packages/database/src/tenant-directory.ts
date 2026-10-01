import { eq } from 'drizzle-orm';
import { dbAdmin } from './db';
import { tenants } from './schema/tenants';

export type TenantLocaleMetadata = { code: string | null; countryCode: string };
export type TenantLegalMetadata = { legalName: string | null; governingLaw: string | null };

// Directory metadata is deny-all to runtime roles. Callers supply a server-authorized
// access/legal tenant ID; these fixed projections grant no member-data access.
export async function readTenantLocaleMetadata(
  tenantId: string
): Promise<TenantLocaleMetadata | null> {
  if (!tenantId.trim()) return null;
  // db-access-guard: system-exempt -- reason: exact authorized tenant locale metadata only; no generic privileged client exposed
  const row = await dbAdmin.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { code: true, countryCode: true },
  });
  return row ?? null;
}

export async function readTenantLegalMetadata(
  tenantId: string
): Promise<TenantLegalMetadata | null> {
  if (!tenantId.trim()) return null;
  // db-access-guard: system-exempt -- reason: exact authorized legal tenant disclosure metadata only; no member data or access-scope change
  const row = await dbAdmin.query.tenants.findFirst({
    where: eq(tenants.id, tenantId),
    columns: { legalName: true, governingLaw: true },
  });
  return row ?? null;
}
