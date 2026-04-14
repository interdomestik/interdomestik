import { getPublicMembershipEntryHref } from '@/lib/public-membership-entry';
import { setRequestLocale } from 'next-intl/server';
import { redirect } from 'next/navigation';

type Props = {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ tenantId?: string; plan?: string }>;
};

export default async function RegisterPage({ params, searchParams }: Props) {
  const { locale } = await params;
  setRequestLocale(locale);
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const destination = new URLSearchParams();
  if (resolvedSearchParams?.tenantId) {
    destination.set('tenantId', resolvedSearchParams.tenantId);
  }

  const pricingHref = getPublicMembershipEntryHref(resolvedSearchParams?.plan ?? null);
  const pricingUrl = new URL(`/${locale}${pricingHref}`, 'http://interdomestik.local');
  for (const [key, value] of destination.entries()) {
    pricingUrl.searchParams.set(key, value);
  }

  redirect(`${pricingUrl.pathname}${pricingUrl.search}`);
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
