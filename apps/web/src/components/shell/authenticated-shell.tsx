import type { ReactElement, ReactNode } from 'react';

import { NextIntlClientProvider } from 'next-intl';

type AuthenticatedShellProps = {
  locale: string;
  messages: Record<string, unknown>;
  children: ReactNode;
};

/**
 * Shared infra-only shell:
 * - NextIntl provider
 * - E2E readiness marker (must remain stable)
 * - NO UI opinions (sidebar/header/content handled by portal wrappers)
 */
export function AuthenticatedShell({
  locale,
  messages,
  children,
}: AuthenticatedShellProps): ReactElement {
  return (
    <NextIntlClientProvider messages={messages} locale={locale}>
      {/* E2E contract: ensureAuthenticated waits for dashboard-page-ready across all portals */}
      <div data-testid="dashboard-page-ready">{children}</div>
    </NextIntlClientProvider>
  );
}
