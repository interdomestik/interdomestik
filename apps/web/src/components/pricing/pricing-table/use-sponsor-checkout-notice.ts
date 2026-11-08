'use client';
import { getCompanyMembershipOutlook } from '@/app/[locale]/(app)/member/membership/leave-sponsorship.core';
import { useEffect, useState } from 'react';
import { getSponsorCheckoutNotice, type SponsorCheckoutNotice } from './pricing-decisions';

export type SponsorCheckoutState = { notice: SponsorCheckoutNotice | null; pending: boolean };

/**
 * ACQ-3b §3.6.3: a signed-in person covered by a company (now or from a later start) is not
 * offered Paddle checkout. A failed read offers checkout as before; the staff queue reports any
 * resulting Paddle row of a covered person.
 */
export function useSponsorCheckoutNotice(userId?: string): SponsorCheckoutState {
  const [state, setState] = useState<SponsorCheckoutState>({ notice: null, pending: !!userId });
  useEffect(() => {
    if (!userId) {
      setState({ notice: null, pending: false });
      return;
    }
    let active = true;
    setState({ notice: null, pending: true });
    getCompanyMembershipOutlook()
      .then(result => {
        if (!active) return;
        setState({
          notice: result.ok ? getSponsorCheckoutNotice(result.outlook) : null,
          pending: false,
        });
      })
      .catch(() => {
        if (active) setState({ notice: null, pending: false });
      });
    return () => {
      active = false;
    };
  }, [userId]);
  return state;
}
