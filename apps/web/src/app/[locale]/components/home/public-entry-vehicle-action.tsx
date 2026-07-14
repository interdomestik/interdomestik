'use client';

import { Link } from '@/i18n/routing';
import { PUBLIC_FREE_START_ANCHOR_HREF } from '@/lib/public-membership-entry';
import { ArrowRight, CarFront } from 'lucide-react';
import { dispatchPublicEntryIntent } from './public-entry-intent';

type PublicEntryVehicleActionProps = Readonly<{ label: string }>;

export function PublicEntryVehicleAction({ label }: PublicEntryVehicleActionProps) {
  return (
    <Link
      data-testid="public-entry-vehicle"
      href={PUBLIC_FREE_START_ANCHOR_HREF}
      onClick={() => dispatchPublicEntryIntent('vehicle')}
      className="group grid min-h-[5.25rem] grid-cols-[3rem_minmax(0,1fr)_1.5rem] items-center gap-3 py-3 text-[#001A33] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#006A70] sm:grid-cols-[4rem_minmax(0,1fr)_1.5rem] sm:gap-5"
    >
      <CarFront
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
