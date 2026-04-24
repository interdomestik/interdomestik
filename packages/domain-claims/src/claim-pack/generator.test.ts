import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { generateClaimPack } from './generator';
import type { ClaimPackInput, VehicleIntakeAnswers } from './types';

describe('generateClaimPack', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  const strongVehicleInput: ClaimPackInput = {
    claimType: 'vehicle',
    answers: {
      incidentDate: '2026-04-10',
      description: 'Rear-end collision at intersection, other driver at fault',
      counterpartyName: 'John Doe',
      counterpartyInsurer: 'Sigal Insurance',
      policeReportFiled: true,
      hasDamagePhotos: true,
      hasRepairEstimate: true,
      estimatedAmount: 350000,
      currency: 'EUR',
    } satisfies VehicleIntakeAnswers,
    locale: 'en',
    uploadedFileCount: 3,
  };

  it('returns a complete claim pack', () => {
    const pack = generateClaimPack(strongVehicleInput);

    expect(pack.claimType).toBe('vehicle');
    expect(pack.generatedAt).toBeTruthy();
    expect(pack.confidence).toBeDefined();
    expect(pack.evidenceChecklist).toBeDefined();
    expect(pack.letter).toBeDefined();
    expect(pack.timeline).toBeDefined();
    expect(pack.recommendedNextStep).toBeDefined();
    expect(pack.disclaimer).toBeTruthy();
  });

  it('includes high confidence for a strong claim', () => {
    const pack = generateClaimPack(strongVehicleInput);
    expect(pack.confidence.level).toBe('high');
    expect(pack.confidence.score).toBeGreaterThanOrEqual(70);
  });

  it('includes evidence checklist for the claim type', () => {
    const pack = generateClaimPack(strongVehicleInput);
    expect(pack.evidenceChecklist.claimType).toBe('vehicle');
    expect(pack.evidenceChecklist.items.length).toBeGreaterThan(0);
  });

  it('generates a letter in the requested locale', () => {
    const pack = generateClaimPack(strongVehicleInput);
    expect(pack.letter.locale).toBe('en');
    expect(pack.letter.body).toContain('vehicle damage');
  });

  it('generates an Albanian letter when locale is sq', () => {
    const pack = generateClaimPack({ ...strongVehicleInput, locale: 'sq' });
    expect(pack.letter.locale).toBe('sq');
    expect(pack.letter.body).toContain('automjetit');
  });

  it('includes timeline milestones', () => {
    const pack = generateClaimPack(strongVehicleInput);
    expect(pack.timeline.milestones.length).toBeGreaterThanOrEqual(5);
  });

  it('includes a recommended next step with CTA', () => {
    const pack = generateClaimPack(strongVehicleInput);
    expect(pack.recommendedNextStep.ctaLabel).toBeTruthy();
    expect(pack.recommendedNextStep.ctaHref).toBeTruthy();
  });

  it('recommends membership for high confidence', () => {
    const pack = generateClaimPack(strongVehicleInput);
    expect(pack.recommendedNextStep.ctaHref).toBe('/pricing');
  });

  it('includes the legal disclaimer', () => {
    const pack = generateClaimPack(strongVehicleInput);
    expect(pack.disclaimer).toContain('not legal advice');
  });

  it('generates pack for property claims', () => {
    const pack = generateClaimPack({
      claimType: 'property',
      answers: {
        incidentDate: '2026-04-05',
        description: 'Water damage from burst pipe',
        hasOwnershipProof: true,
      },
    });
    expect(pack.claimType).toBe('property');
    expect(pack.evidenceChecklist.claimType).toBe('property');
  });

  it('generates pack for injury claims', () => {
    const pack = generateClaimPack({
      claimType: 'injury',
      answers: {
        incidentDate: '2026-04-01',
        description: 'Workplace slip and fall',
        hasMedicalRecords: true,
        hasIncidentReport: true,
      },
    });
    expect(pack.claimType).toBe('injury');
    expect(pack.evidenceChecklist.claimType).toBe('injury');
  });

  it('is idempotent for the same input', () => {
    const pack1 = generateClaimPack(strongVehicleInput);
    const pack2 = generateClaimPack(strongVehicleInput);
    expect(pack1.confidence.score).toBe(pack2.confidence.score);
    expect(pack1.confidence.level).toBe(pack2.confidence.level);
    expect(pack1.evidenceChecklist.items).toEqual(pack2.evidenceChecklist.items);
    expect(pack1.letter.body).toBe(pack2.letter.body);
  });
});
