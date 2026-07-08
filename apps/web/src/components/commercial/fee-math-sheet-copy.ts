import { EN_FEE_MATH_SHEET_COPY } from './fee-math-sheet-copy-en';
import { MK_FEE_MATH_SHEET_COPY } from './fee-math-sheet-copy-mk';
import { SQ_FEE_MATH_SHEET_COPY } from './fee-math-sheet-copy-sq';
import { SR_FEE_MATH_SHEET_COPY } from './fee-math-sheet-copy-sr';

export const FEE_MATH_SHEET_COPY_KEYS = [
  'fees.lossPromise',
  'fees.courtPathCosts',
  'fees.thirdPartyCosts',
  'fees.reimbursement',
] as const;

export type FeeMathSheetCopyKey = (typeof FEE_MATH_SHEET_COPY_KEYS)[number];

export type ThirdPartyCostTreatment = Readonly<{
  mode: 'written_agreement_required';
  reviewedCopyKeys: readonly FeeMathSheetCopyKey[];
}>;

export type FeeMathSheetCopy = Readonly<{
  eyebrow: string;
  title: string;
  body: string;
  treatmentLabel: string;
  rows: readonly Readonly<{
    key: FeeMathSheetCopyKey;
    label: string;
    body: string;
  }>[];
}>;

export const THIRD_PARTY_COST_TREATMENT: ThirdPartyCostTreatment = {
  mode: 'written_agreement_required',
  reviewedCopyKeys: FEE_MATH_SHEET_COPY_KEYS,
};

const NET_AMOUNT_LABELS = {
  en: 'You receive before court costs',
  mk: 'Вие добивате пред судски трошоци',
  sq: 'Ju merrni para kostove gjyqësore',
  sr: 'Vi dobijate pre sudskih troškova',
} as const;

function resolveFeeMathLocale(locale: string): keyof typeof NET_AMOUNT_LABELS {
  const normalized = locale.toLowerCase();
  if (normalized.startsWith('mk')) return 'mk';
  if (normalized.startsWith('sq')) return 'sq';
  if (normalized.startsWith('sr')) return 'sr';
  return 'en';
}

export function getFeeMathSheetCopy(locale: string): FeeMathSheetCopy {
  switch (resolveFeeMathLocale(locale)) {
    case 'mk':
      return MK_FEE_MATH_SHEET_COPY;
    case 'sq':
      return SQ_FEE_MATH_SHEET_COPY;
    case 'sr':
      return SR_FEE_MATH_SHEET_COPY;
    default:
      return EN_FEE_MATH_SHEET_COPY;
  }
}

export function getFeeMathSheetNetAmountLabel(locale: string): string {
  return NET_AMOUNT_LABELS[resolveFeeMathLocale(locale)];
}
