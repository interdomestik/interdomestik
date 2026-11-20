/** Preserve configured tenant names and append country only when absent. */
export function formatAdminTenantLabel(name: string, countryCode: string): string {
  const country = countryCode.toUpperCase() === 'XK' ? 'KS' : countryCode.toUpperCase();
  return /\([a-z]{2}\)\s*$/i.test(name) ? name : `${name} (${country})`;
}
