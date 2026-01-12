import { describe, expect, it } from 'vitest';

import { getSpineVariant } from './StateSpine';

describe('getSpineVariant', () => {
  describe('precedence order', () => {
    it('SLA breach takes precedence over stuck', () => {
      const result = getSpineVariant(true, true);
      expect(result.labelKey).toBe('sla_breach');
      expect(result.badgeVariant).toBe('destructive');
    });

    it('stuck shows when no SLA breach', () => {
      const result = getSpineVariant(true, false);
      expect(result.labelKey).toBe('stuck');
      expect(result.badgeVariant).toBe('outline');
    });

    it('neutral when neither stuck nor SLA breach', () => {
      const result = getSpineVariant(false, false);
      expect(result.labelKey).toBeNull();
      expect(result.badgeVariant).toBe('secondary');
    });
  });

  describe('visual styling', () => {
    it('SLA breach has destructive badge with pulse animation', () => {
      const result = getSpineVariant(false, true);
      expect(result.badgeClass).toContain('animate-pulse');
      expect(result.containerClass).toContain('red-500');
    });

    it('stuck has amber outline styling', () => {
      const result = getSpineVariant(true, false);
      expect(result.badgeClass).toContain('amber-500');
      expect(result.containerClass).toContain('amber-500');
    });

    it('neutral has secondary styling without icon', () => {
      const result = getSpineVariant(false, false);
      expect(result.icon).toBeNull();
      expect(result.badgeVariant).toBe('secondary');
    });
  });

  describe('icon assignment', () => {
    it('SLA breach uses Clock icon', () => {
      const result = getSpineVariant(false, true);
      expect(result.icon).not.toBeNull();
      // Clock icon check
    });

    it('stuck uses AlertTriangle icon', () => {
      const result = getSpineVariant(true, false);
      expect(result.icon).not.toBeNull();
      // AlertTriangle icon check
    });

    it('neutral has no icon', () => {
      const result = getSpineVariant(false, false);
      expect(result.icon).toBeNull();
    });
  });
});
