'use client';

import { setCookie } from 'cookies-next';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect } from 'react';

function ReferralTrackerContent() {
  const searchParams = useSearchParams();

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) {
      // Store the referral code in a cookie that expires in 30 days
      setCookie('agent_ref', ref, { maxAge: 60 * 60 * 24 * 30 });
      console.log('🔗 Agent referral captured:', ref);
    }
  }, [searchParams]);

  return null;
}

export function ReferralTracker() {
  return (
    <Suspense fallback={null}>
      <ReferralTrackerContent />
    </Suspense>
  );
}
