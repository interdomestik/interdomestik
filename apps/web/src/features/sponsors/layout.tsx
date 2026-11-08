import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

/** The integration owner registers sponsors in MESSAGE_NAMESPACES; keep area catalogs scoped. */
export async function SponsorLayout({
  children,
}: {
  children: React.ReactNode;
}): Promise<React.JSX.Element> {
  const messages = await getMessages();
  return (
    <NextIntlClientProvider messages={{ sponsors: messages.sponsors }}>
      {children}
    </NextIntlClientProvider>
  );
}
