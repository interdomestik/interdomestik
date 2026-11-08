import type { TenantTransaction } from '@interdomestik/database';
import {
  readTenantAuthority,
  type TenantAuthority,
} from '@interdomestik/database/tenant-authority';
import { withTenantAuthority } from '@interdomestik/database/tenant-authority-context';

import { readSponsorOutlook, type SponsorOutlook } from '../../sponsor-coverage/outlook';
import { resolveBillingPeriodDate, type SubscriptionEventData } from './dunning-state';

/**
 * ACQ-3b §3.10: a past-due mail keeps only the payment facts when a sponsor covers the member now
 * or coverage starts by the end of the failing period; access then never lapses on this payment.
 */
export function sponsorAccessContinues(
  outlook: SponsorOutlook | undefined,
  periodEnd: Date | null
): boolean {
  if (outlook?.covering) return true;
  return Boolean(outlook?.nextStart && periodEnd && outlook.nextStart <= periodEnd);
}

/** The same decision inside a caller's tenant transaction (delivery holds the subscription lock). */
export async function pastDueAccessContinuesInTx(
  tx: TenantTransaction,
  args: { tenantId: string; userId: string; periodEnd: Date | null; now: Date }
): Promise<boolean> {
  const outlooks = await readSponsorOutlook(tx, args.tenantId, [args.userId], args.now);
  return sponsorAccessContinues(outlooks.get(args.userId), args.periodEnd);
}

export async function readPastDueAccessContinues(args: {
  authority: TenantAuthority;
  userId: string;
  sub: SubscriptionEventData;
  now: Date;
}): Promise<boolean> {
  const { tenantId } = readTenantAuthority(args.authority);
  const outlooks = await withTenantAuthority(args.authority, tx =>
    readSponsorOutlook(tx, tenantId, [args.userId], args.now)
  );
  const periodEnd = resolveBillingPeriodDate(
    args.sub.currentBillingPeriod?.endsAt,
    args.sub.current_billing_period?.ends_at as string | null | undefined
  );
  return sponsorAccessContinues(outlooks.get(args.userId), periodEnd);
}
