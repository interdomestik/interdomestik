'use client';

import { useRouter } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useTransition, type ReactNode } from 'react';

// Persistent named region across failure, retries and populated or empty success. Only a
// keyboard-activated retry owns recovery focus; focus or pointer interaction away from the
// retry, or Tab, releases it so success never steals focus from a draft or other control.
export function InformationRequestReadRecovery({
  failed,
  children,
}: Readonly<{ failed: boolean; children?: ReactNode }>) {
  const t = useTranslations('claims.informationRequests');
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const region = useRef<HTMLElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const ownsFocus = useRef(false);

  useEffect(() => {
    const relinquishOnFocus = (event: FocusEvent) => {
      if (event.target !== retry.current) ownsFocus.current = false;
    };
    const relinquishOnInteraction = (event: Event) => {
      const tab = event instanceof KeyboardEvent && event.key === 'Tab';
      if (tab || event.target !== retry.current) ownsFocus.current = false;
    };
    document.addEventListener('focusin', relinquishOnFocus);
    document.addEventListener('pointerdown', relinquishOnInteraction);
    document.addEventListener('keydown', relinquishOnInteraction);
    return () => {
      document.removeEventListener('focusin', relinquishOnFocus);
      document.removeEventListener('pointerdown', relinquishOnInteraction);
      document.removeEventListener('keydown', relinquishOnInteraction);
    };
  }, []);

  useEffect(() => {
    if (failed || !ownsFocus.current) return;
    ownsFocus.current = false;
    // The retry unmounted with the failure; move focus only if it fell back to the document.
    const active = document.activeElement;
    if (active === null || active === document.body) {
      region.current?.focus({ preventScroll: true });
    }
  }, [failed]);

  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-label={t('title')}
      data-testid="information-request-read-region"
      className="min-w-0 space-y-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {failed ? (
        <div className="space-y-3" data-testid="information-request-read-recovery">
          <output className="block" aria-live="polite" aria-atomic="true">
            {isPending ? t('loadingRequests') : t('loadError')}
          </output>
          <Button
            ref={retry}
            type="button"
            variant="outline"
            className="h-auto min-h-10 max-w-full whitespace-normal break-words text-center"
            aria-busy={isPending}
            aria-disabled={isPending}
            onClick={event => {
              if (isPending) return;
              // Keyboard activation (detail 0) of the focused retry is the only focus owner.
              ownsFocus.current = event.detail === 0 && document.activeElement === retry.current;
              startTransition(() => router.refresh());
            }}
          >
            {t('retryRead')}
          </Button>
        </div>
      ) : (
        children
      )}
    </section>
  );
}
