'use client';
import { forwardRef } from 'react';
import type { SponsorCheckoutNotice as Notice } from './pricing-decisions';

type Props = {
  notice: Notice;
  locale: string;
  t: (key: string, values?: Record<string, string>) => string;
};

export const SponsorCheckoutNotice = forwardRef<HTMLDivElement, Props>(
  function SponsorCheckoutNotice({ notice, locale, t }, ref) {
    const date = new Intl.DateTimeFormat(locale, { dateStyle: 'long' }).format(notice.date);
    return (
      <div
        ref={ref}
        role="status"
        tabIndex={-1}
        data-testid="pricing-sponsor-notice"
        className="mx-auto max-w-2xl rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm text-blue-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        {t(`sponsorNotice.${notice.key}`, { date })}
      </div>
    );
  }
);
