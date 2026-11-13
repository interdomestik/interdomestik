export function normalizePublicLink(link: string, _currentOrigin?: string | null): string {
  if (!link) return link;
  const source = new URL(link);
  if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) {
    throw new Error('Invalid public application link');
  }
  // The server has already resolved the deployment door. Preserve its exact bytes.
  return link;
}

export function normalizeWhatsAppShareUrl(
  shareUrl: string,
  _currentOrigin?: string | null
): string {
  if (!shareUrl) return shareUrl;
  const wrapper = new URL(shareUrl);
  if (wrapper.origin !== 'https://wa.me' || wrapper.username || wrapper.password) {
    throw new Error('Invalid WhatsApp share link');
  }
  const text = wrapper.searchParams.get('text');
  if (!text) return shareUrl;
  for (const candidate of text.match(/https?:\/\/[^\s]+/g) ?? []) normalizePublicLink(candidate);
  return shareUrl;
}
