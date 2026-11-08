'use client';

import { Button } from '@interdomestik/ui/components/button';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type ReactElement } from 'react';

export function OptOutForm({ token }: { token: string }): ReactElement {
  const t = useTranslations('sponsorOptOut');
  const [status, setStatus] = useState<'idle' | 'pending' | 'done' | 'invalid' | 'error'>('idle');
  const result = useRef<HTMLParagraphElement>(null);
  const submitting = useRef(false);

  useEffect(() => {
    if (status === 'done' || status === 'invalid' || status === 'error') result.current?.focus();
  }, [status]);

  async function confirm(): Promise<void> {
    if (submitting.current) return;
    submitting.current = true;
    setStatus('pending');
    try {
      const response = await fetch('/api/public/sponsor-opt-out', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        referrerPolicy: 'no-referrer',
        body: JSON.stringify({ token }),
      });
      const body: unknown = await response.json();
      if (
        response.ok &&
        typeof body === 'object' &&
        body !== null &&
        'ok' in body &&
        body.ok === true
      ) {
        setStatus('done');
      } else {
        setStatus(response.status === 400 ? 'invalid' : 'error');
      }
    } catch {
      setStatus('error');
    } finally {
      submitting.current = false;
    }
  }

  return (
    <div className="space-y-4" aria-busy={status === 'pending'}>
      <p
        ref={result}
        tabIndex={-1}
        role="status"
        aria-live="polite"
        className="rounded focus-visible:outline focus-visible:outline-2"
      >
        {status !== 'idle' ? t(status) : ''}
      </p>
      {status !== 'done' && status !== 'invalid' && (
        <Button type="button" onClick={confirm} disabled={status === 'pending'}>
          {t(status === 'error' ? 'retry' : 'confirm')}
        </Button>
      )}
    </div>
  );
}
