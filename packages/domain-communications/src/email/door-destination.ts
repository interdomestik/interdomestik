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

/** Newsletter hero CTAs are application links; legacy country/deployment origins may be rebased. */
export function resolveNewsletterDestination(link: string): string {
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
  if (
    url.origin !== origin &&
    (!applicationHosts.includes(url.hostname) || url.protocol !== 'https:')
  ) {
    throw new Error('Invalid newsletter application destination');
  }
  if (url.username || url.password || /[\s\\]/u.test(link)) {
    throw new Error('Invalid newsletter application destination');
  }
  return resolveDoorDestination(`${url.pathname}${url.search}${url.hash}`);
}
