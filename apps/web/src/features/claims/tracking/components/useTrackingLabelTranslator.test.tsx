import { renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useTrackingLabelTranslator } from './useTrackingLabelTranslator';

vi.mock('next-intl', () => ({
  useTranslations: (namespace?: string) => {
    if (namespace === 'claims-tracking.status') {
      return (key: string) => (key === 'evaluation' ? 'Evaluation' : `status.${key}`);
    }
    if (namespace === 'claims-tracking.tracking.timeline') {
      return (key: string) => (key === 'generic' ? 'Case update' : `timeline.${key}`);
    }
    return (key: string) => `${namespace}.${key}`;
  },
}));

describe('useTrackingLabelTranslator', () => {
  it('translates status and fixed timeline fallback keys without exposing raw event names', () => {
    const { result } = renderHook(() => useTrackingLabelTranslator());

    expect(result.current('claims-tracking.status.evaluation')).toBe('Evaluation');
    expect(result.current('claims-tracking.tracking.timeline.generic')).toBe('Case update');
    expect(result.current('claims-tracking.internal.unhandled')).toBe('Case update');
  });
});
