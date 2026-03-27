function getOriginOrNull(): string | null {
  if (typeof globalThis.window === 'undefined') return null;

  try {
    return globalThis.window.location.origin;
  } catch {
    return null;
  }
}

export function normalizePublicLink(link: string, currentOrigin = getOriginOrNull()): string {
  if (!link || !currentOrigin) return link;

  try {
    const parsedLink = new URL(link);
    const parsedOrigin = new URL(currentOrigin);

    parsedLink.protocol = parsedOrigin.protocol;
    parsedLink.host = parsedOrigin.host;

    return parsedLink.toString();
  } catch {
    return link;
  }
}

export function normalizeWhatsAppShareUrl(
  shareUrl: string,
  currentOrigin = getOriginOrNull()
): string {
  if (!shareUrl || !currentOrigin) return shareUrl;

  try {
    const parsedShareUrl = new URL(shareUrl);
    const rawText = parsedShareUrl.searchParams.get('text');
    if (!rawText) return shareUrl;

    parsedShareUrl.searchParams.set(
      'text',
      rawText.replaceAll(/https?:\/\/[^\s]+/g, candidate =>
        normalizePublicLink(candidate, currentOrigin)
      )
    );
    return parsedShareUrl.toString();
  } catch {
    return shareUrl;
  }
}
