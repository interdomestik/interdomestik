import { PublicTrackingCard } from '@/features/claims/tracking/components/PublicTrackingCard';
import { getPublicClaimStatus } from '@/features/claims/tracking/server/getPublicClaimStatus';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

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
  const { lang } = await searchParams; // Default to en

  // Validate locale simple check
  const locale = (['en', 'sq', 'mk', 'sr'].includes(lang || '') ? lang : 'en') as any;

  const data = await getPublicClaimStatus(token);

  if (!data) {
    // If invalid token, show generic 404 or specific error page
    // For security, just 404 is often best to prevent enumeration,
    // but user experience might prefer "Invalid Link"
    return (
      <div className="flex min-h-screen items-center justify-center bg-gray-50 p-4">
        <div className="text-center space-y-4">
          <h1 className="text-2xl font-bold text-gray-900">Link Invalid or Expired</h1>
          <p className="text-gray-500">This tracking link is no longer valid.</p>
        </div>
      </div>
    );
  }

  // Load messages for the isolated page
  // We need specific namespaces
  const messages = await getMessages({ locale });
  const pick = (obj: any, keys: string[]) => {
    // minimal pick
    const ret: any = {};
    keys.forEach(k => {
      if (obj[k]) ret[k] = obj[k];
    });
    return ret;
  };

  // We can pass all messages or just relevant ones
  // NextIntlClientProvider needs messages to work for useTranslations

  return (
    <NextIntlClientProvider locale={locale} messages={messages}>
      <div className="min-h-screen bg-gray-50 flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
        <div className="text-center mb-8">
          {/* Brand / Logo */}
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
