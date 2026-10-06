'use client';

import { useRouter } from '@/i18n/routing';
import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, useTransition, type ReactNode } from 'react';

export function AdminUsersReadRecovery({
  message,
  children,
}: {
  message: string | null;
  children: ReactNode;
}) {
  const router = useRouter();
  const t = useTranslations('common');
  const [hasRetried, setHasRetried] = useState(false);
  const [isPending, startTransition] = useTransition();
  const region = useRef<HTMLDivElement>(null);
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

  return (
    <div
      ref={region}
      role="region"
      tabIndex={-1}
      aria-labelledby="admin-users-heading"
      data-testid="admin-users-read-region"
      className="min-w-0 space-y-6 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
    >
      {message && (
        <div
          data-testid="admin-users-read-recovery"
          className="flex min-w-0 flex-col items-start gap-3 rounded-lg border p-4 sm:flex-row sm:items-center sm:justify-between"
        >
          <p role="alert" className="min-w-0 break-words">
            {message}
          </p>
          <Button
            ref={retry}
            type="button"
            aria-disabled={isPending}
            aria-busy={isPending}
            className="shrink-0"
            onClick={event => {
              if (isPending) return;
              setHasRetried(true);
              ownsFocus.current = event.detail === 0 && document.activeElement === retry.current;
              startTransition(() => router.refresh());
            }}
          >
            {isPending ? t('loading') : t('tryAgain')}
          </Button>
          <span role="status" className="sr-only">
            {isPending ? t('loading') : hasRetried ? message : ''}
          </span>
        </div>
      )}
      {children}
    </div>
  );
}
