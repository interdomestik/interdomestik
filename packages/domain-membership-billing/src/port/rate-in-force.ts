import { exchangeRates } from '@interdomestik/database/schema';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';
import { withTenant } from '@interdomestik/database/tenant-security';
import { and, desc, lte } from 'drizzle-orm';

import { skopjeDate } from './calendar';

export async function getExchangeRateInForce(authority: TenantAuthority, instant: Date) {
  const { accessTenantId } = readTenantAuthority(authority);
  const effectiveDate = skopjeDate(instant);
  return withTenantAuthority(authority, async tx => {
    const [rate] = await tx
      .select()
      .from(exchangeRates)
      .where(
        withTenant(
          accessTenantId,
          exchangeRates.tenantId,
          and(
            lte(exchangeRates.storedAt, instant.toISOString()),
            lte(exchangeRates.effectiveOn, effectiveDate)
          )
        )
      )
      .orderBy(desc(exchangeRates.effectiveOn), desc(exchangeRates.revision))
      .limit(1);
    return rate
      ? { ok: true as const, rate }
      : { ok: false as const, code: 'rate_unavailable' as const };
  });
}
