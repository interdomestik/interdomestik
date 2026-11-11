import { getClientDeploymentOrigin } from './deployment-origin.client';

export function normalizePublicLink(link: string, _currentOrigin?: string | null): string {
  if (!link) return link;
  const origin = getClientDeploymentOrigin();
  const source = new URL(link);
  if (!['http:', 'https:'].includes(source.protocol) || source.username || source.password) {
    throw new Error('Invalid public application link');
  }
  return `${origin}${source.pathname}${source.search}${source.hash}`;
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
  wrapper.searchParams.set(
    'text',
    text.replaceAll(/https?:\/\/[^\s]+/g, candidate => normalizePublicLink(candidate))
  );
  return wrapper.toString();
}
