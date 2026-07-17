import { LOCALES, type AppLocale } from '@/i18n/locales';

import type { SelfServePlanId } from '@/components/pricing/pricing-table/types';

type PricingEntryEnv = Readonly<Record<string, string | undefined>>;

type PricingSearchParams = Record<string, string | string[] | undefined> | undefined;

const CANONICAL_IDA_ORIGIN = 'https://ida.interdomestik.com';
const SELF_SERVE_PLANS = new Set<SelfServePlanId>(['standard', 'family']);

function isLoopbackHost(hostname: string): boolean {
  return (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname === '127.0.0.1' ||
    /(^|\.)127\.0\.0\.1\.nip\.io$/.test(hostname)
  );
}

function parseConfiguredIdaOrigin(value: string): URL {
  const configured = value.trim();
  if (
    !configured ||
    configured.startsWith('//') ||
    (/^[a-z][a-z\d+.-]*:(?!\/\/)/i.test(configured) && !/^[\w.-]+:\d+$/.test(configured))
  ) {
    throw new Error('invalid_ida_host');
  }
  const candidate = /^[a-z][a-z\d+.-]*:\/\//i.test(configured)
    ? configured
    : `${isLoopbackHost(configured.split(':')[0]!.toLowerCase()) ? 'http' : 'https'}://${configured}`;
  let url: URL;
  try {
    url = new URL(candidate);
  } catch {
    throw new Error('invalid_ida_host');
  }
  const hasUnsafeParts =
    url.username || url.password || url.pathname !== '/' || url.search || url.hash;
  const unsafeProtocol = url.protocol !== 'https:' && url.protocol !== 'http:';
  if (
    hasUnsafeParts ||
    unsafeProtocol ||
    (url.protocol === 'http:' && !isLoopbackHost(url.hostname))
  ) {
    throw new Error('invalid_ida_host');
  }
  return url;
}

function localIdaOrigin(appUrl?: string): string | null {
  if (!appUrl) return null;
  try {
    const app = new URL(appUrl);
    if (app.protocol !== 'http:' || !isLoopbackHost(app.hostname)) return null;
    return `http://ida.localhost${app.port ? `:${app.port}` : ''}`;
  } catch {
    return null;
  }
}

export function buildNeutralPricingEntryUrl(
  locale: string,
  env: PricingEntryEnv = process.env
): string {
  if (!LOCALES.includes(locale as AppLocale)) throw new Error('invalid_pricing_locale');
  const origin = env.IDA_HOST
    ? parseConfiguredIdaOrigin(env.IDA_HOST).origin
    : (localIdaOrigin(env.NEXT_PUBLIC_APP_URL) ?? CANONICAL_IDA_ORIGIN);
  return `${origin}/${locale}/pricing`;
}

export function parseNeutralPricingPlan(params: PricingSearchParams): SelfServePlanId | null {
  if (!params || Object.keys(params).length !== 1 || typeof params.plan !== 'string') return null;
  return SELF_SERVE_PLANS.has(params.plan as SelfServePlanId)
    ? (params.plan as SelfServePlanId)
    : null;
}
