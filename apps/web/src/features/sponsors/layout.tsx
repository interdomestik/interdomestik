import { NextIntlClientProvider } from 'next-intl';
import { getMessages } from 'next-intl/server';

/** Scope the client catalogs of a sponsor area to the namespaces its client components use. */
export async function SponsorLayout({
  children,
  namespaces = ['sponsors'],
}: {
  children: React.ReactNode;
  namespaces?: readonly string[];
}): Promise<React.JSX.Element> {
  const messages = await getMessages();
  const scoped = Object.fromEntries(namespaces.map(namespace => [namespace, messages[namespace]]));
  return <NextIntlClientProvider messages={scoped}>{children}</NextIntlClientProvider>;
}
