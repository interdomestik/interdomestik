import type { ReactElement, ReactNode } from 'react';

import { NextIntlClientProvider } from 'next-intl';

import { NavigationFeedback } from './navigation-feedback';

type AuthenticatedShellProps = {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
  enableNavigationFeedback?: boolean;
};

/**
 * Shared portal shell:
 * - NextIntl provider
 * - E2E readiness marker (must remain stable)
 * - optional shared navigation feedback for portal route transitions
 * - no portal chrome opinions (sidebar/header/content handled by portal wrappers)
 */
export function AuthenticatedShell({
  locale,
  messages,
  children,
  enableNavigationFeedback = true,
}: AuthenticatedShellProps): ReactElement {
  const readyContent = (
    <>
      {/* E2E contract: ensureAuthenticated waits for dashboard-page-ready across all portals */}
      <div data-testid="dashboard-page-ready">{children}</div>
    </>
  );

  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      {enableNavigationFeedback ? (
        <NavigationFeedback>{readyContent}</NavigationFeedback>
      ) : (
        readyContent
      )}
    </NextIntlClientProvider>
  );
}
