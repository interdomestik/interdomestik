const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function savedDraftContinuationHref(locale: string, id: string): string | null {
  if (!['en', 'sq', 'mk', 'sr'].includes(locale) || !UUID.test(id)) return null;
  return `/${locale}/member/claims/new?mode=drafts#draft=${id}`;
}

export function readSavedDraftContinuation(hash: string): string | null {
  const match = /^#draft=(.+)$/.exec(hash);
  return match && UUID.test(match[1]!) ? match[1]! : null;
}
