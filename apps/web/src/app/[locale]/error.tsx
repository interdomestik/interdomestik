'use client';

import { PortalError, type PortalErrorProps } from '@/components/portal-error';

/** Locale-level boundary keeps the contractual not-found-page marker used by E2E gates. */
export default function LocaleError(props: Omit<PortalErrorProps, 'testId'>) {
  return <PortalError {...props} testId="not-found-page" />;
}
