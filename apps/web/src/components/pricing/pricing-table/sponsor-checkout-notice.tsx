'use client';
import { forwardRef } from 'react';
import { formatPilotDate } from '@/lib/utils/date';
import type { SponsorCheckoutNotice as Notice } from './pricing-decisions';

type Props = {
  notice: Notice;
  locale: string;
  t: (key: string, values?: Record<string, string>) => string;
};

export const SponsorCheckoutNotice = forwardRef<HTMLOutputElement, Props>(
  function SponsorCheckoutNotice({ notice, locale, t }, ref) {
    const date = formatPilotDate(notice.date, locale, '');
    return (
      <output
        ref={ref}
        tabIndex={-1}
        data-testid="pricing-sponsor-notice"
        className="block mx-auto max-w-2xl rounded-lg border border-blue-200 bg-blue-50 px-4 py-3 text-center text-sm text-blue-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
      >
        {t(`sponsorNotice.${notice.key}`, { date })}
      </output>
    );
  }
);
