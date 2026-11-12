import '@interdomestik/ui/globals.css';
import { BrandedNotFound } from '@/components/branded-not-found';
import { DEFAULT_LOCALE } from '@/i18n/locales';
import messages from '@/messages/sq/common.json';

export default function RootNotFound(): React.JSX.Element {
  return (
    <html lang={DEFAULT_LOCALE}>
      <body className="antialiased">
        <BrandedNotFound homeHref={`/${DEFAULT_LOCALE}`} copy={messages.common.notFound} />
      </body>
    </html>
  );
}
