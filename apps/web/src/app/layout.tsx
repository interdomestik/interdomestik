import { routing } from '@/i18n/routing';
import { type ReactNode } from 'react';

// Root layout must own the single <html>/<body> tags; downstream layouts should render fragments only.
export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang={routing.defaultLocale} suppressHydrationWarning>
      <body className="antialiased" suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
