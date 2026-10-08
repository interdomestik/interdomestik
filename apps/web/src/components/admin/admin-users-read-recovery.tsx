'use client';

import { useRouter } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';

export function AdminUsersReadRecovery({
  message,
  children,
  headingId = 'admin-users-heading',
  regionTestId = 'admin-users-read-region',
  recoveryTestId = 'admin-users-read-recovery',
  narrowPresentation = false,
}: Readonly<{
  message: string | null;
  children: ReactNode;
  headingId?: string;
  regionTestId?: string;
  recoveryTestId?: string;
  /** Claims-only: tighter padding and a wrapping retry label below sm. */
  narrowPresentation?: boolean;
}>) {
  const router = useRouter();
  const t = useTranslations('common');
  const [hasRetried, setHasRetried] = useState(false);
  const [isPending, startTransition] = useTransition();
  const region = useRef<HTMLElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const ownsFocus = useRef(false);

  useEffect(() => {
    const relinquishFocus = (event: FocusEvent) => {
      if (event.target !== retry.current) ownsFocus.current = false;
    };
    const relinquishOnInteraction = (event: Event) => {
      if (
        event.target !== retry.current ||
        (event instanceof KeyboardEvent && event.key === 'Tab')
      ) {
        ownsFocus.current = false;
      }
    };
    document.addEventListener('focusin', relinquishFocus);
    document.addEventListener('pointerdown', relinquishOnInteraction);
    document.addEventListener('keydown', relinquishOnInteraction);
    return () => {
      document.removeEventListener('focusin', relinquishFocus);
      document.removeEventListener('pointerdown', relinquishOnInteraction);
      document.removeEventListener('keydown', relinquishOnInteraction);
    };
  }, []);

  useEffect(() => {
    if (!message) setHasRetried(false);
    if (!message && ownsFocus.current) {
      // Only restore the keyboard retry's focus if no newer control owns it.
      if (document.activeElement === document.body || document.activeElement === retry.current) {
        region.current?.focus({ preventScroll: true });
      }
      ownsFocus.current = false;
    }
  }, [message]);

  let statusMessage = '';
  if (isPending) statusMessage = t('loading');
  else if (hasRetried) statusMessage = message ?? '';

  return (
    <section
      ref={region}
      tabIndex={-1}
      aria-labelledby={headingId}
      data-testid={regionTestId}
      className="min-w-0 space-y-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {message && (
        <div
          data-testid={recoveryTestId}
          className={`flex min-w-0 flex-col items-start gap-3 rounded-lg border sm:flex-row sm:items-center sm:justify-between ${
            narrowPresentation ? 'p-2 sm:p-4' : 'p-4'
          }`}
        >
          <p role="alert" className="min-w-0 break-words">
            {message}
          </p>
          <Button
            ref={retry}
            type="button"
            aria-disabled={isPending}
            aria-busy={isPending}
            className={
              narrowPresentation
                ? 'shrink-0 max-sm:h-auto max-sm:min-h-10 max-sm:max-w-full max-sm:whitespace-normal max-sm:[overflow-wrap:anywhere] max-sm:py-2 max-sm:text-center'
                : 'shrink-0'
            }
            onClick={event => {
              if (isPending) return;
              setHasRetried(true);
              ownsFocus.current = event.detail === 0 && document.activeElement === retry.current;
              startTransition(() => router.refresh());
            }}
          >
            {isPending ? t('loading') : t('tryAgain')}
          </Button>
          <output aria-live="polite" className="sr-only">
            {statusMessage}
          </output>
        </div>
      )}
      {children}
    </section>
  );
}
