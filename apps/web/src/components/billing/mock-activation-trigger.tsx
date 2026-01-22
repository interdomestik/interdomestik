'use client';

import { mockActivateSubscription } from '@/actions/billing-test';
import { useEffect, useRef } from 'react';

interface MockActivationTriggerProps {
  planId: string;
  priceId: string;
}

/**
 * CLIENT-ONLY Component to trigger mock activation.
 * This avoids calling server actions with revalidatePath during SSR/Render.
 */
export function MockActivationTrigger({ planId, priceId }: MockActivationTriggerProps) {
  const triggered = useRef(false);

  useEffect(() => {
    if (triggered.current) return;
    triggered.current = true;

    async function activate() {
      try {
        await mockActivateSubscription(planId, priceId);
      } catch (error) {
        console.error('❌ [MockActivationTrigger] Activation failed:', error);
      }
    }

    activate();
  }, [planId, priceId]);

  return null;
}
