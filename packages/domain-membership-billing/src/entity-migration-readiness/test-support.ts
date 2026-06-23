import type { EntityMigrationReadinessCandidate } from './types';

export function readinessCandidate(
  overrides: Partial<EntityMigrationReadinessCandidate> = {}
): EntityMigrationReadinessCandidate {
  return {
    memberId: 'member-1',
    tenantId: 'tenant-home',
    subscriptionId: 'sub-1',
    residenceCountry: 'DE',
    subscriptionLegalTenantId: 'tenant-home',
    subscriptionLegalEntityId: 'le-de',
    governingLawSnapshot: 'DE',
    termsVersionAccepted: 'terms-2026-06',
    targetLegalEntity: {
      id: 'le-de',
      tenantId: 'tenant-home',
      countryCode: 'DE',
      governingLaw: 'DE',
      termsVersion: 'terms-2026-07',
      isActive: true,
    },
    defaultBookingLink: {
      id: 'booking-link-1',
      tenantId: 'tenant-home',
      defaultBookingTenantId: 'tenant-home',
      legalEntityId: 'le-de',
    },
    activeRecoveryCases: [],
    ...overrides,
  };
}
