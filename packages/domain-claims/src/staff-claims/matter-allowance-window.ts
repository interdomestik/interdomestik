// The allowance window and plan allowance of a recovery matter: pure, no tenant access.

export const FAMILY_MATTER_ALLOWANCE = 5;
export const STANDARD_MATTER_ALLOWANCE = 2;

export type NormalizableDate = Date | string | null | undefined;

function normalizeDate(value: NormalizableDate) {
  if (!value) return null;

  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export function buildMatterAllowanceWindow(params: {
  currentPeriodEnd: NormalizableDate;
  currentPeriodStart: NormalizableDate;
  now: Date;
}) {
  const currentPeriodStart = normalizeDate(params.currentPeriodStart);
  const currentPeriodEnd = normalizeDate(params.currentPeriodEnd);

  if (currentPeriodStart && currentPeriodEnd) {
    return { end: currentPeriodEnd, start: currentPeriodStart };
  }

  const fallbackEnd = currentPeriodEnd ?? params.now;
  const fallbackStart =
    currentPeriodStart ??
    new Date(
      Date.UTC(
        fallbackEnd.getUTCFullYear() - 1,
        fallbackEnd.getUTCMonth(),
        fallbackEnd.getUTCDate()
      )
    );

  return { end: fallbackEnd, start: fallbackStart };
}

export function resolveMatterAllowance(planId: string | null | undefined) {
  return planId === 'family' || planId === 'business'
    ? FAMILY_MATTER_ALLOWANCE
    : STANDARD_MATTER_ALLOWANCE;
}
