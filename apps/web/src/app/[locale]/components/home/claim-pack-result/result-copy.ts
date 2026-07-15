import type { ClaimPackType } from '@interdomestik/domain-claims/claim-pack';
import type { useTranslations } from 'next-intl';

export type ResultCopy = ReturnType<typeof useTranslations<'freeStart.result'>>;

const EVIDENCE_IDS = [
  'vehicle_photos',
  'vehicle_police_report',
  'vehicle_insurance_details',
  'vehicle_repair_estimate',
  'vehicle_registration',
  'vehicle_driver_license',
  'property_photos',
  'property_ownership',
  'property_damage_report',
  'property_insurance_policy',
  'property_repair_quotes',
  'property_correspondence',
  'injury_medical_records',
  'injury_incident_report',
  'injury_witness_statements',
  'injury_expense_receipts',
  'injury_photos',
  'injury_lost_income',
] as const;

const TIMELINE_IDS = [
  'evidence_collection',
  'first_letter',
  'expected_response',
  'insurer_assessment',
  'damage_assessment',
  'medical_documentation',
  'escalation_window',
] as const;

function hasValue<Value extends string>(values: readonly Value[], value: string): value is Value {
  return values.includes(value as Value);
}

export function getEvidenceCopy(t: ResultCopy, id: string) {
  const key = hasValue(EVIDENCE_IDS, id) ? id : 'unknown';
  return {
    description: t(`evidence.items.${key}.description`),
    name: t(`evidence.items.${key}.name`),
  };
}

function getTimelineKey(
  claimType: ClaimPackType,
  id: string
): (typeof TIMELINE_IDS)[number] | `resolution.${ClaimPackType}` | 'unknown' {
  if (id === 'resolution') return `resolution.${claimType}`;
  return hasValue(TIMELINE_IDS, id) ? id : 'unknown';
}

export function getTimelineCopy(t: ResultCopy, claimType: ClaimPackType, id: string) {
  const key = getTimelineKey(claimType, id);
  return {
    description: t(`timeline.items.${key}.description`),
    label: t(`timeline.items.${key}.label`),
  };
}

export function getTimelineRange(t: ResultCopy, value: string): string {
  if (value === 'After counterparty response') return t('timeline.ranges.afterResponse');

  const match = /^(\d+)[–-](\d+) (business days|days|weeks|months)$/.exec(value);
  if (!match) return t('timeline.ranges.unknown');

  const rangeKey = {
    'business days': 'businessDays',
    days: 'days',
    months: 'months',
    weeks: 'weeks',
  }[match[3] as 'business days' | 'days' | 'months' | 'weeks'];

  return t(`timeline.ranges.${rangeKey}`, { end: match[2], start: match[1] });
}
