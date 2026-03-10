import type { CoverageMatrixProps } from './coverage-matrix';

type CoverageMatrixTranslator = (key: string) => string;

export function buildCoverageMatrixProps(
  t: CoverageMatrixTranslator,
  sectionTestId: NonNullable<CoverageMatrixProps['sectionTestId']>
): CoverageMatrixProps {
  return {
    columns: [t('columns.included'), t('columns.escalation'), t('columns.referral')],
    eyebrow: t('eyebrow'),
    footerBody: t('footer.body'),
    footerTitle: t('footer.title'),
    rowHeaderTitle: t('rowHeaderTitle'),
    rows: [
      {
        cells: [
          { label: t('rows.vehicle.included'), tone: 'included' },
          { label: t('rows.vehicle.escalation'), tone: 'escalation' },
          { label: t('rows.vehicle.referral'), tone: 'referral' },
        ],
        description: t('rows.vehicle.description'),
        title: t('rows.vehicle.title'),
      },
      {
        cells: [
          { label: t('rows.property.included'), tone: 'included' },
          { label: t('rows.property.escalation'), tone: 'escalation' },
          { label: t('rows.property.referral'), tone: 'referral' },
        ],
        description: t('rows.property.description'),
        title: t('rows.property.title'),
      },
      {
        cells: [
          { label: t('rows.injury.included'), tone: 'included' },
          { label: t('rows.injury.escalation'), tone: 'escalation' },
          { label: t('rows.injury.referral'), tone: 'referral' },
        ],
        description: t('rows.injury.description'),
        title: t('rows.injury.title'),
      },
      {
        cells: [
          { label: t('rows.guidance.included'), tone: 'included' },
          { label: t('rows.guidance.escalation'), tone: 'unavailable' },
          { label: t('rows.guidance.referral'), tone: 'referral' },
        ],
        description: t('rows.guidance.description'),
        title: t('rows.guidance.title'),
      },
      {
        cells: [
          { label: t('rows.flight.included'), tone: 'laterPhase' },
          { label: t('rows.flight.escalation'), tone: 'laterPhase' },
          { label: t('rows.flight.referral'), tone: 'laterPhase' },
        ],
        description: t('rows.flight.description'),
        title: t('rows.flight.title'),
      },
    ],
    sectionTestId,
    subtitle: t('subtitle'),
    title: t('title'),
  };
}
