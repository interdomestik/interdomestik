'use client';

import { useTranslations } from 'next-intl';

export function PublicEntrySessionSkeleton() {
  const common = useTranslations('common');

  return (
    <section
      aria-busy="true"
      aria-label={common('loading')}
      aria-live="polite"
      className="mx-auto flex min-h-[24rem] max-w-6xl items-center justify-center px-6"
      data-testid="public-entry-session-skeleton"
      role="status"
    >
      <div aria-hidden="true" className="h-12 w-48 animate-pulse rounded-full bg-muted" />
      <span className="sr-only">{common('loading')}</span>
    </section>
  );
}
