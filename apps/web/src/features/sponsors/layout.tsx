import { NextIntlClientProvider } from 'next-intl';
import { getMessages, setRequestLocale } from 'next-intl/server';

/** Scope the client catalogs of a sponsor area to the namespaces its client components use. */
export async function SponsorLayout({
  children,
  locale,
  namespaces = ['sponsors'],
}: {
  children: React.ReactNode;
  locale: string;
  namespaces?: readonly string[];
}): Promise<React.JSX.Element> {
  setRequestLocale(locale);
  const messages = await getMessages({ locale });
  const scoped = Object.fromEntries(namespaces.map(namespace => [namespace, messages[namespace]]));
  return <NextIntlClientProvider messages={scoped}>{children}</NextIntlClientProvider>;
}
