'use client';

import { useEffect, useState } from 'react';

const COOKIE_CONSENT_KEY = 'interdomestik-cookie-consent';

export type CookieConsentStatus = 'undecided' | 'accepted' | 'rejected';

export function useCookieConsent() {
  const [status, setStatus] = useState<CookieConsentStatus>('undecided');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const saved = localStorage.getItem(COOKIE_CONSENT_KEY);
    if (saved === 'accepted' || saved === 'rejected') {
      setStatus(saved);
    }
  }, []);

  const accept = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'accepted');
    setStatus('accepted');
    // Here you would trigger analytics initialization
  };

  const reject = () => {
    localStorage.setItem(COOKIE_CONSENT_KEY, 'rejected');
    setStatus('rejected');
  };

  return {
    status,
    isOpen: mounted && status === 'undecided',
    accept,
    reject,
  };
}
