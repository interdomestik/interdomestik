import type { CoverageCellTone, CoverageMatrixProps } from './coverage-matrix';

type CoverageMatrixTranslator = (key: string) => string;
type CoverageMatrixColumnKey = 'included' | 'escalation' | 'referral';
type CoverageMatrixRowKey = 'vehicle' | 'property' | 'injury' | 'guidance' | 'flight';

const COLUMN_KEYS: readonly CoverageMatrixColumnKey[] = ['included', 'escalation', 'referral'];

const ROW_CONFIGS: ReadonlyArray<
  Readonly<{
    key: CoverageMatrixRowKey;
    tones: readonly [CoverageCellTone, CoverageCellTone, CoverageCellTone];
  }>
> = [
  { key: 'vehicle', tones: ['included', 'escalation', 'referral'] },
  { key: 'property', tones: ['included', 'escalation', 'referral'] },
  { key: 'injury', tones: ['included', 'escalation', 'referral'] },
  { key: 'guidance', tones: ['included', 'unavailable', 'referral'] },
  { key: 'flight', tones: ['laterPhase', 'laterPhase', 'laterPhase'] },
];

function getTranslationKey(rowKey: CoverageMatrixRowKey, columnKey: CoverageMatrixColumnKey) {
  return `rows.${rowKey}.${columnKey}`;
}

function buildCoverageMatrixRow(t: CoverageMatrixTranslator, rowKey: CoverageMatrixRowKey) {
  return {
    description: t(`rows.${rowKey}.description`),
    title: t(`rows.${rowKey}.title`),
  };
}

export function buildCoverageMatrixProps(
  t: CoverageMatrixTranslator,
  sectionTestId: NonNullable<CoverageMatrixProps['sectionTestId']>
): CoverageMatrixProps {
  return {
    columns: COLUMN_KEYS.map(columnKey => t(`columns.${columnKey}`)),
    eyebrow: t('eyebrow'),
    footerBody: t('footer.body'),
    footerTitle: t('footer.title'),
    rowHeaderTitle: t('rowHeaderTitle'),
    rows: ROW_CONFIGS.map(({ key, tones }) => ({
      ...buildCoverageMatrixRow(t, key),
      cells: COLUMN_KEYS.map((columnKey, index) => ({
        label: t(getTranslationKey(key, columnKey)),
        tone: tones[index],
      })),
    })),
    sectionTestId,
    subtitle: t('subtitle'),
    title: t('title'),
  };
}
