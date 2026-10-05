import type * as Sentry from '@sentry/nextjs';

// Custom records are not rrweb DOM records. Fail closed for all custom payloads:
// network, console, navigation, selectors, performance URLs and user text.
export const replayPrivacyOptions: Parameters<typeof Sentry.replayIntegration>[0] = {
  maskAllText: true,
  maskAllInputs: true,
  blockAllMedia: true,
  unmask: [],
  unblock: [],
  stickySession: false,
  block: [
    'svg',
    'canvas',
    'iframe',
    'object',
    'embed',
    'input[type="file"]',
    '[data-testid="free-start-intake-shell"]',
  ],
  maskAttributes: [
    'id',
    'class',
    'name',
    'title',
    'alt',
    'placeholder',
    'aria-label',
    'aria-labelledby',
    'aria-describedby',
    'href',
    'src',
    'srcset',
    'action',
    'formaction',
    'value',
    'data-testid',
    'data-tenant-id',
    'data-claim-id',
    'data-draft-id',
    'data-document-id',
  ],
  networkDetailAllowUrls: [],
  networkDetailDenyUrls: [/.*/],
  networkCaptureBodies: false,
  networkRequestHeaders: [],
  networkResponseHeaders: [],
  beforeAddRecordingEvent: () => null,
};

/** Only inspected landing/login are eligible; the landing intake is fully blocked. */
export function isReplaySafeLocation(href: string): boolean {
  try {
    const url = new URL(href);
    return (
      !url.search &&
      !url.hash &&
      (/^\/(sq|en|sr|mk)(\/login)?\/?$/.test(url.pathname) || url.pathname === '/')
    );
  } catch {
    return false;
  }
}
