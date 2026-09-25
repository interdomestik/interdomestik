import { evaluateNeutralOtpHost } from '@/app/api/auth/[...all]/neutral-otp-boundary';
import { SavedDraftSignIn } from '@/components/auth/saved-draft-sign-in';
import { resolveDefaultPublicTenantId } from '@/lib/tenant/tenant-hosts';
import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';
import { headers } from 'next/headers';

export async function SavedDraftSignInEntry({ locale }: Readonly<{ locale: string }>) {
  if (!evaluateNeutralOtpHost(await headers())) return null;
  const messages = await getMessages({ locale });
  return (
    <NextIntlClientProvider locale={locale} messages={{ freeStart: messages.freeStart }}>
      <SavedDraftSignIn locale={locale} tenantId={resolveDefaultPublicTenantId()} />
    </NextIntlClientProvider>
  );
}
