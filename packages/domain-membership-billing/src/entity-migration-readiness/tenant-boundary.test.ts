import { describe, expect, it } from 'vitest';

import { classifyEntityMigrationReadinessCandidate } from './classifier';
import { readinessCandidate } from './test-support';

describe('entity migration readiness tenant boundaries', () => {
  it('blocks a subscription legal tenant mismatch', () => {
    const result = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({ subscriptionLegalTenantId: 'tenant-other' })
    );

    expect(result.status).toBe('blocked_repair_required');
    expect(result.repairCategories).toEqual(['subscription_legal_tenant_mismatch']);
  });

  it('blocks a target legal entity from a different tenant', () => {
    const result = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({
        targetLegalEntity: {
          id: 'le-de',
          tenantId: 'tenant-other',
          countryCode: 'DE',
          governingLaw: 'DE',
          termsVersion: 'terms-2026-07',
          isActive: true,
        },
      })
    );

    expect(result.status).toBe('blocked_repair_required');
    expect(result.repairCategories).toEqual(['target_legal_entity_tenant_mismatch']);
  });

  it('blocks a target legal entity from a different residence country', () => {
    const result = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({
        residenceCountry: 'DE',
        targetLegalEntity: {
          id: 'le-fr',
          tenantId: 'tenant-home',
          countryCode: 'FR',
          governingLaw: 'FR',
          termsVersion: 'terms-2026-07',
          isActive: true,
        },
        defaultBookingLink: {
          id: 'booking-link-1',
          tenantId: 'tenant-home',
          defaultBookingTenantId: 'tenant-home',
          legalEntityId: 'le-fr',
        },
      })
    );

    expect(result.status).toBe('blocked_repair_required');
    expect(result.repairCategories).toEqual(['target_legal_entity_country_mismatch']);
  });

  it('blocks booking links with either tenant boundary out of scope', () => {
    const bookingTenantResult = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({
        defaultBookingLink: {
          id: 'booking-link-1',
          tenantId: 'tenant-other',
          defaultBookingTenantId: 'tenant-home',
          legalEntityId: 'le-de',
        },
      })
    );
    const defaultTenantResult = classifyEntityMigrationReadinessCandidate(
      readinessCandidate({
        defaultBookingLink: {
          id: 'booking-link-1',
          tenantId: 'tenant-home',
          defaultBookingTenantId: 'tenant-other',
          legalEntityId: 'le-de',
        },
      })
    );

    expect(bookingTenantResult.repairCategories).toEqual(['booking_tenant_mismatch']);
    expect(defaultTenantResult.repairCategories).toEqual(['booking_tenant_mismatch']);
  });
});
