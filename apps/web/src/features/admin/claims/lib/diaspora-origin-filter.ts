export type AdminDiasporaOriginFilter = 'all' | 'diaspora';

export function parseAdminDiasporaOriginFilter(
  value: string | null | undefined
): AdminDiasporaOriginFilter {
  return value === 'diaspora' ? 'diaspora' : 'all';
}
