/** The explicit override also supports transaction poolers exposed on a custom port. */
export function isTransactionPooler(databaseUrl: string, override?: string): boolean {
  if (override === '1') return true;

  try {
    const url = new URL(databaseUrl);
    return ['postgres:', 'postgresql:'].includes(url.protocol) && url.port === '6543';
  } catch {
    return false;
  }
}
