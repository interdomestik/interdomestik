'use client';

import { Link } from '@/i18n/routing';
import { ArrowRight, Plane } from 'lucide-react';
import { dispatchPublicEntryIntent } from './public-entry-intent';

type PublicEntryFlightActionProps = Readonly<{ label: string }>;

export function PublicEntryFlightAction({ label }: PublicEntryFlightActionProps) {
  return (
    <Link
      data-testid="public-entry-flight"
      href="#flight-guidance"
      onClick={() => dispatchPublicEntryIntent('flight')}
      className="group grid min-h-[5.25rem] grid-cols-[3rem_minmax(0,1fr)_1.5rem] items-center gap-3 py-3 text-[#001A33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#006A70] sm:grid-cols-[4rem_minmax(0,1fr)_1.5rem] sm:gap-5"
    >
      <Plane
        aria-hidden="true"
        className="h-8 w-8 text-[#006A70] sm:h-10 sm:w-10"
        strokeWidth={1.5}
      />
      <span className="text-base font-semibold leading-6 sm:text-lg">{label}</span>
      <ArrowRight
        aria-hidden="true"
        className="h-5 w-5 text-[#006A70] transition-transform group-hover:translate-x-1 motion-reduce:transform-none motion-reduce:transition-none"
      />
    </Link>
  );
}
