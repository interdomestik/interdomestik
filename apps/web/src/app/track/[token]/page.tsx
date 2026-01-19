import { PublicTrackingCard } from '@/features/claims/tracking/components/PublicTrackingCard';
import { getPublicClaimStatus } from '@/features/claims/tracking/server/getPublicClaimStatus';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { headers } from 'next/headers';
import { getTrackingViewCore } from './_core';

interface PageProps {
  params: Promise<{
    token: string;
  }>;
  searchParams: Promise<{
    lang?: string;
  }>;
}

export default async function PublicTrackingPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { lang } = await searchParams;
  const headerList = await headers();
  const ipAddress = headerList.get('x-forwarded-for') || 'unknown';
  const userAgent = headerList.get('user-agent') || 'unknown';

  // Validate locale simple check
  const locale = (['en', 'sq', 'mk', 'sr'].includes(lang || '') ? lang : 'en') as
    | 'en'
    | 'sq'
    | 'mk'
    | 'sr';

  const result = await getTrackingViewCore(
    { token, ipAddress, userAgent },
    {
      getPublicClaimStatusFn: getPublicClaimStatus,
      // logTrackingAttemptFn could be added here if we have a separate action for it
    }
  );

  if (!result.ok) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Link Invalid or Expired</h1>
          <p className="text-gray-500">This tracking link is no longer valid.</p>
        </div>
      </div>
    );
  }

  const data = result.data;
  const messages = await getMessages({ locale });

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          <h2 className="text-3xl font-extrabold text-gray-900 tracking-tight">Interdomestik</h2>
          <p className="mt-2 text-sm text-gray-600">Claim Tracking Portal</p>
        </div>

        <PublicTrackingCard data={data} />

        <div className="mt-8 text-center text-xs text-gray-400">
          &copy; {new Date().getFullYear()} Interdomestik. All rights reserved.
        </div>
      </div>
    </NextIntlClientProvider>
  );
}
