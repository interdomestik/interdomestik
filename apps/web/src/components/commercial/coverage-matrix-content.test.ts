import { describe, expect, it } from 'vitest';

import { COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORY_IDS } from '@/lib/commercial-claim-categories';
import { buildCoverageMatrixProps } from './coverage-matrix-content';

const EXPECTED_ROW_KEYS = [
  ...COMMERCIAL_ESCALATION_ELIGIBLE_CATEGORY_IDS,
  'guidance',
  'flight',
] as const;
const EXPECTED_ROW_TONES = [
  ['included', 'escalation', 'referral'],
  ['included', 'escalation', 'referral'],
  ['included', 'escalation', 'referral'],
  ['included', 'unavailable', 'referral'],
  ['laterPhase', 'laterPhase', 'laterPhase'],
] as const;

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

    expect(props.rows).toHaveLength(EXPECTED_ROW_KEYS.length);
    expect(props.rows.map(row => row.title)).toEqual(
      EXPECTED_ROW_KEYS.map(rowKey => `translated:rows.${rowKey}.title`)
    );
    expect(props.rows.map(row => row.description)).toEqual(
      EXPECTED_ROW_KEYS.map(rowKey => `translated:rows.${rowKey}.description`)
    );
    expect(props.rows.map(row => row.cells.map(cell => cell.tone))).toEqual(EXPECTED_ROW_TONES);
    expect(props.rows.map(row => row.cells.map(cell => cell.label))).toEqual(
      EXPECTED_ROW_KEYS.map(rowKey =>
        ['included', 'escalation', 'referral'].map(
          columnKey => `translated:rows.${rowKey}.${columnKey}`
        )
      )
    );
    expect(props.footerTitle).toBe('translated:footer.title');
    expect(props.footerBody).toBe('translated:footer.body');
  });
});
