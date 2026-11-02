import type { IngressCapability } from '@interdomestik/database/ingress';
import type { TenantAuthority } from '@interdomestik/database/tenant-authority';
import { mintTestTenantAuthority } from '@interdomestik/database/testing/tenant-authority';
import { TEST_PADDLE_DELIVERY } from '../paddle-authority.test-support';

export const T1 = '2026-09-26T10:00:00.100Z';
export const T2 = '2026-09-26T10:00:00.200Z';

export const KS_AUTHORITY: TenantAuthority = mintTestTenantAuthority('tenant_ks');

function pastDueBody(occurredAt: string | undefined, eventId: string) {
  return {
    data: {
      id: 'sub_1',
      status: 'past_due',
      customData: { userId: 'user_1', tenantId: 'tenant_ks' },
      items: [{ price: { id: 'standard', description: 'Asistenca' } }],
      currentBillingPeriod: {
        startsAt: '2026-09-01T00:00:00Z',
        endsAt: '2027-09-01T00:00:00Z',
      },
    },
    processingScopeKey: 'entity:ks',
    providerEventId: eventId,
    providerEventOccurredAt: occurredAt,
  };
}

export function pastDue(
  occurredAt: string | undefined,
  eventId: string
): ReturnType<typeof pastDueBody> & {
  delivery: IngressCapability<'paddle-delivery'>;
  authority: TenantAuthority;
} {
  return {
    ...pastDueBody(occurredAt, eventId),
    delivery: TEST_PADDLE_DELIVERY,
    authority: KS_AUTHORITY,
  };
}
