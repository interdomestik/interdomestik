'use client';

import { setCookieConsent, useCookieConsent } from '@/lib/cookie-consent';
import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';

export function CookieConsentBanner() {
  const t = useTranslations('common.cookie_consent');
  const { consent, ready } = useCookieConsent();

  if (!ready || consent) return null;

  const handleDecision = (value: 'accepted' | 'necessary') => {
    setCookieConsent(value);
  };

  return (
    <section
      data-testid="cookie-consent-banner"
      className="fixed bottom-4 left-4 right-4 z-50 rounded-xl border border-border bg-background/95 p-4 shadow-lg backdrop-blur sm:left-auto sm:max-w-xl"
      aria-live="polite"
    >
      <h2 className="text-base font-semibold text-foreground">{t('title')}</h2>
      <p className="mt-2 text-sm text-muted-foreground">{t('description')}</p>
      <p className="mt-1 text-xs text-muted-foreground">{t('details')}</p>
      <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:justify-end">
        <Button
          variant="outline"
          data-testid="cookie-consent-decline"
          onClick={() => handleDecision('necessary')}
        >
          {t('decline')}
        </Button>
        <Button data-testid="cookie-consent-accept" onClick={() => handleDecision('accepted')}>
          {t('accept')}
        </Button>
      </div>
    </section>
  );
}
