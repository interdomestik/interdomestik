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
  const [pricingPath, pricingQuery = ''] = getPublicMembershipEntryHref(
    resolvedSearchParams?.plan ?? null
  ).split('?');
  const destination = new URLSearchParams(pricingQuery);

  if (resolvedSearchParams?.tenantId) {
    destination.set('tenantId', resolvedSearchParams.tenantId);
  }

  const query = destination.toString();
  redirect(`/${locale}${pricingPath}${query ? `?${query}` : ''}`);
}

export { generateMetadata, generateViewport } from '@/app/_segment-exports';
