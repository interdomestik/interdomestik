import { resolveDeploymentOrigin } from '../deployment-origin.mjs';

/** Application CTA contract: relative paths or the validated runtime door, never foreign origins. */
export function resolveDoorDestination(link: string): string {
  const { origin } = resolveDeploymentOrigin();
  if (!link || /[\s\\]/u.test(link)) throw new Error('Invalid email application destination');
  const url = new URL(link, `${origin}/`);
  if (url.origin !== origin || url.username || url.password) {
    throw new Error('Invalid email application destination');
  }
  return `${origin}${url.pathname}${url.search}${url.hash}`;
}

/** Push callers already build same-origin paths; only absolute links need a deployment origin. */
export function resolvePushDestination(link: string): string {
  if (link.startsWith('/') && !link.startsWith('//') && !/[\s\\]/u.test(link)) return link;
  return resolveDoorDestination(link);
}

/** Legacy application destinations may be rebased; foreign origins must never be delivered. */
export function rebaseApplicationDestination(link: string): string {
  const { origin } = resolveDeploymentOrigin();
  const url = new URL(link, `${origin}/`);
  const applicationHosts = [
    'ida.interdomestik.com',
    'staging.interdomestik.com',
    'ks.interdomestik.com',
    'mk.interdomestik.com',
    'al.interdomestik.com',
    'pilot.interdomestik.com',
    'www.interdomestik.com',
  ];
  if (url.origin !== origin && !applicationHosts.some(host => url.origin === `https://${host}`)) {
    throw new Error('Invalid email application destination');
  }
  if (url.username || url.password || /[\s\\]/u.test(link)) {
    throw new Error('Invalid email application destination');
  }
  return resolveDoorDestination(`${url.pathname}${url.search}${url.hash}`);
}

export { rebaseApplicationDestination as resolveNewsletterDestination };
