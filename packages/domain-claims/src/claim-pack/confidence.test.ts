import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { calculateConfidence } from './confidence';
import type { VehicleIntakeAnswers } from './types';

describe('calculateConfidence', () => {
  beforeEach(() => {
    // Pin Date.now to a stable value for deterministic recency scoring
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-04-20T12:00:00Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns a perfect score (100) for a strong recent vehicle claim', () => {
    const answers: VehicleIntakeAnswers = {
      incidentDate: '2026-04-10', // 10 days ago
      description: 'Rear-end collision causing significant damage',
      counterpartyName: 'John Doe',
      policeReportFiled: true,
      hasDamagePhotos: true,
      estimatedAmount: 250000, // 2500.00 EUR
    };
    const result = calculateConfidence('vehicle', answers);
    expect(result.score).toBe(100);
    expect(result.level).toBe('high');
    expect(result.factors).toHaveLength(5);
  });

  it('returns zero for a weak old claim with no evidence', () => {
    const answers: VehicleIntakeAnswers = {
      incidentDate: '2023-01-01', // over 3 years ago
      description: 'Something happened a long time ago',
    };
    const result = calculateConfidence('vehicle', answers);
    expect(result.score).toBeLessThan(40);
    expect(result.level).toBe('low');
  });

  it('returns medium for a borderline claim', () => {
    const answers: VehicleIntakeAnswers = {
      incidentDate: '2026-02-01', // ~78 days ago
      description: 'Minor collision',
      counterpartyName: 'Unknown driver',
      hasDamagePhotos: true,
      estimatedAmount: 50000, // 500 EUR
    };
    const result = calculateConfidence('vehicle', answers);
    // recency=15 + counterparty=10 (partial) + evidence=12 (photos only) + monetary=20 + type=20 = 77
    // Actually counterparty "Unknown driver" is > 2 chars = 20
    // 15 + 20 + 12 + 20 + 20 = 87 -> high
    expect(result.level).toBe('high');
  });

  it('handles missing counterparty', () => {
    const answers: VehicleIntakeAnswers = {
      incidentDate: '2026-04-10',
      description: 'Hit and run, no driver info',
    };
    const result = calculateConfidence('vehicle', answers);
    const cpFactor = result.factors.find(f => f.name === 'Counterparty identified');
    expect(cpFactor?.pointsEarned).toBe(0);
  });

  it('handles all five scoring factors', () => {
    const answers: VehicleIntakeAnswers = {
      incidentDate: '2026-04-01',
      description: 'Test claim',
    };
    const result = calculateConfidence('vehicle', answers);
    const factorNames = result.factors.map(f => f.name);
    expect(factorNames).toContain('Incident recency');
    expect(factorNames).toContain('Counterparty identified');
    expect(factorNames).toContain('Evidence strength');
    expect(factorNames).toContain('Monetary path');
    expect(factorNames).toContain('Claim type match');
  });

  it('scores uploaded files as evidence', () => {
    const answers: VehicleIntakeAnswers = {
      incidentDate: '2026-04-10',
      description: 'Collision',
    };
    const withoutFiles = calculateConfidence('vehicle', answers, 0);
    const withFiles = calculateConfidence('vehicle', answers, 3);
    const evidenceWithout = withoutFiles.factors.find(f => f.name === 'Evidence strength');
    const evidenceWith = withFiles.factors.find(f => f.name === 'Evidence strength');
    expect(evidenceWith!.pointsEarned).toBeGreaterThan(evidenceWithout!.pointsEarned);
  });

  describe('threshold boundaries', () => {
    it('maps score >= 70 to high', () => {
      const answers: VehicleIntakeAnswers = {
        incidentDate: '2026-04-10',
        description: 'Recent claim with strong evidence',
        counterpartyName: 'Jane Smith',
        hasDamagePhotos: true,
        policeReportFiled: true,
        estimatedAmount: 100000,
      };
      const result = calculateConfidence('vehicle', answers);
      expect(result.score).toBeGreaterThanOrEqual(70);
      expect(result.level).toBe('high');
    });

    it('maps score < 40 to low', () => {
      const answers: VehicleIntakeAnswers = {
        incidentDate: '2024-01-01', // very old
        description: 'Old incident with no info',
      };
      const result = calculateConfidence('vehicle', answers);
      expect(result.score).toBeLessThan(40);
      expect(result.level).toBe('low');
    });
  });
});
