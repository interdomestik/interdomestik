import { describe, expect, it } from 'vitest';

import { buildCoverageMatrixProps } from './coverage-matrix-content';

describe('buildCoverageMatrixProps', () => {
  it('builds the shared coverage matrix content from translation keys', () => {
    const t = (key: string) => `translated:${key}`;

    const props = buildCoverageMatrixProps(t, 'pricing-coverage-matrix');

    expect(props.sectionTestId).toBe('pricing-coverage-matrix');
    expect(props.eyebrow).toBe('translated:eyebrow');
    expect(props.title).toBe('translated:title');
    expect(props.subtitle).toBe('translated:subtitle');
    expect(props.columns).toEqual([
      'translated:columns.included',
      'translated:columns.escalation',
      'translated:columns.referral',
    ]);
    expect(props.rows).toEqual([
      {
        title: 'translated:rows.vehicle.title',
        description: 'translated:rows.vehicle.description',
        cells: [
          { label: 'translated:rows.vehicle.included', tone: 'included' },
          { label: 'translated:rows.vehicle.escalation', tone: 'escalation' },
          { label: 'translated:rows.vehicle.referral', tone: 'referral' },
        ],
      },
      {
        title: 'translated:rows.property.title',
        description: 'translated:rows.property.description',
        cells: [
          { label: 'translated:rows.property.included', tone: 'included' },
          { label: 'translated:rows.property.escalation', tone: 'escalation' },
          { label: 'translated:rows.property.referral', tone: 'referral' },
        ],
      },
      {
        title: 'translated:rows.injury.title',
        description: 'translated:rows.injury.description',
        cells: [
          { label: 'translated:rows.injury.included', tone: 'included' },
          { label: 'translated:rows.injury.escalation', tone: 'escalation' },
          { label: 'translated:rows.injury.referral', tone: 'referral' },
        ],
      },
      {
        title: 'translated:rows.guidance.title',
        description: 'translated:rows.guidance.description',
        cells: [
          { label: 'translated:rows.guidance.included', tone: 'included' },
          { label: 'translated:rows.guidance.escalation', tone: 'unavailable' },
          { label: 'translated:rows.guidance.referral', tone: 'referral' },
        ],
      },
      {
        title: 'translated:rows.flight.title',
        description: 'translated:rows.flight.description',
        cells: [
          { label: 'translated:rows.flight.included', tone: 'laterPhase' },
          { label: 'translated:rows.flight.escalation', tone: 'laterPhase' },
          { label: 'translated:rows.flight.referral', tone: 'laterPhase' },
        ],
      },
    ]);
    expect(props.footerTitle).toBe('translated:footer.title');
    expect(props.footerBody).toBe('translated:footer.body');
  });
});
