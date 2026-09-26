export const T1 = '2026-09-26T10:00:00.100Z';
export const T2 = '2026-09-26T10:00:00.200Z';

export function pastDue(occurredAt: string | undefined, eventId: string) {
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
    tenantId: 'tenant_ks',
    processingScopeKey: 'entity:ks',
    providerEventId: eventId,
    providerEventOccurredAt: occurredAt,
  };
}
