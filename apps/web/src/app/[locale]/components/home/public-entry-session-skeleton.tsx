'use client';

import { useTranslations } from 'next-intl';

/**
 * Announces the pending session to assistive technology only.
 *
 * The public Hero and intake already render while the session resolves, so this
 * status must stay out of the layout: a painted placeholder reserved hero space
 * and then released it on settlement, shifting usable content.
 */
export function PublicEntrySessionSkeleton() {
  const common = useTranslations('common');

  return (
    <section
      aria-busy="true"
      aria-label={common('loading')}
      aria-live="polite"
      className="sr-only"
      data-testid="public-entry-session-skeleton"
      role="status"
    >
      {common('loading')}
    </section>
  );
}
