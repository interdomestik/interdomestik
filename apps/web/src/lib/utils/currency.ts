export function formatClaimAmount(
  amount: string | null | undefined,
  currency: string | null | undefined,
  locale: string
): string | null {
  if (typeof amount !== 'string' || !/^-?\d+(?:\.\d+)?$/.test(amount.trim())) return null;
  if (typeof currency !== 'string' || !/^[A-Za-z]{3}$/.test(currency.trim())) return null;
  const value = Number(amount);
  if (!Number.isFinite(value)) return null;
  try {
    return new Intl.NumberFormat(locale, {
      style: 'currency',
      currency: currency.trim().toUpperCase(),
    }).format(value);
  } catch {
    return null;
  }
}
