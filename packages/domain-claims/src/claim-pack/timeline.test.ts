import { describe, expect, it } from 'vitest';
import { estimateTimeline } from './timeline';

describe('estimateTimeline', () => {
  describe('vehicle claims', () => {
    it('includes vehicle-specific milestones', () => {
      const result = estimateTimeline('vehicle', 'high');
      const ids = result.milestones.map(m => m.id);
      expect(ids).toContain('evidence_collection');
      expect(ids).toContain('first_letter');
      expect(ids).toContain('expected_response');
      expect(ids).toContain('insurer_assessment');
      expect(ids).toContain('resolution');
      expect(ids).toContain('escalation_window');
    });

    it('has faster estimates for high confidence', () => {
      const high = estimateTimeline('vehicle', 'high');
      const low = estimateTimeline('vehicle', 'low');
      const highEvidence = high.milestones.find(m => m.id === 'evidence_collection');
      const lowEvidence = low.milestones.find(m => m.id === 'evidence_collection');
      expect(highEvidence?.estimatedRange).toBe('1–3 days');
      expect(lowEvidence?.estimatedRange).toBe('1–3 weeks');
    });
  });

  describe('property claims', () => {
    it('includes property-specific milestones', () => {
      const result = estimateTimeline('property', 'medium');
      const ids = result.milestones.map(m => m.id);
      expect(ids).toContain('damage_assessment');
      expect(ids).toContain('resolution');
    });
  });

  describe('injury claims', () => {
    it('includes injury-specific milestones', () => {
      const result = estimateTimeline('injury', 'medium');
      const ids = result.milestones.map(m => m.id);
      expect(ids).toContain('medical_documentation');
      expect(ids).toContain('resolution');
    });
  });

  describe('all types', () => {
    it.each(['vehicle', 'property', 'injury'] as const)(
      'returns escalation window for %s claims',
      claimType => {
        const result = estimateTimeline(claimType, 'medium');
        const escalation = result.milestones.find(m => m.id === 'escalation_window');
        expect(escalation).toBeDefined();
        expect(escalation?.estimatedRange).toBe('After counterparty response');
      }
    );

    it.each(['high', 'medium', 'low'] as const)(
      'returns milestones for confidence level %s',
      level => {
        const result = estimateTimeline('vehicle', level);
        expect(result.milestones.length).toBeGreaterThanOrEqual(5);
        expect(result.confidenceLevel).toBe(level);
      }
    );
  });
});
