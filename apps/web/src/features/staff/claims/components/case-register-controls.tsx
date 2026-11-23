'use client';

import type { ActionResult } from '@/lib/safe-action';
import { Button, Input } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition, type ComponentProps, type ReactNode } from 'react';

export type RegisterDocument = { id: string; name: string };

const errorKeys: Readonly<Record<string, string>> = {
  UNAUTHORIZED: 'signIn',
  FORBIDDEN: 'forbidden',
  NOT_FOUND: 'forbidden',
  MISSING_TENANT: 'forbidden',
  VALIDATION_ERROR: 'invalid',
  invalid: 'invalid',
  invalid_state: 'invalidState',
  authority_invalid: 'authorityInvalid',
  document_invalid: 'documentInvalid',
  conflict: 'conflict',
};

export function useRegisterMutation() {
  const router = useRouter();
  const inFlight = useRef(false);
  const [pending, startTransition] = useTransition();
  const [feedback, setFeedback] = useState<{ failed: boolean; key: string } | null>(null);

  function run(write: () => ActionResult<unknown>, onSaved?: () => void) {
    if (inFlight.current || pending) return;
    inFlight.current = true;
    setFeedback(null);
    startTransition(async () => {
      try {
        const result = await write();
        if (!result.success) {
          const code = result.code ?? '';
          const key = code.startsWith('FORBIDDEN') ? 'forbidden' : errorKeys[code];
          if (code === 'conflict') router.refresh();
          setFeedback({ failed: true, key: key ?? 'failed' });
          return;
        }
        onSaved?.();
        setFeedback({ failed: false, key: 'saved' });
        router.refresh();
      } catch {
        setFeedback({ failed: true, key: 'failed' });
      } finally {
        inFlight.current = false;
      }
    });
  }

  return { feedback, pending, run };
}

export function RegisterFeedback({
  pending,
  feedback,
}: Readonly<Pick<ReturnType<typeof useRegisterMutation>, 'feedback' | 'pending'>>) {
  const t = useTranslations('staff-correspondence.feedback');
  let status: string | null = null;
  if (pending) status = t('saving');
  else if (feedback && !feedback.failed) status = t(feedback.key);
  return (
    <>
      <output className="text-sm">{status}</output>
      {feedback?.failed && (
        <p role="alert" className="text-sm text-red-800">
          {t(feedback.key)}
        </p>
      )}
    </>
  );
}

export function RegisterReadError({ code }: Readonly<{ code?: string }>) {
  const t = useTranslations('staff-correspondence.feedback');
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-2" aria-busy={pending}>
      <p role="alert">{t(code === 'forbidden' ? 'forbidden' : 'readFailed')}</p>
      <Button
        type="button"
        variant="outline"
        aria-disabled={pending}
        onClick={() => {
          if (!pending) startTransition(() => router.refresh());
        }}
      >
        {t('retry')}
      </Button>
      <output className="ms-2 text-sm">{pending && t('loading')}</output>
    </div>
  );
}

export function RegisterSubmit({
  children,
  disabled = false,
  pending,
}: Readonly<{ children: ReactNode; disabled?: boolean; pending: boolean }>) {
  return (
    <Button type="submit" disabled={disabled} aria-disabled={pending || disabled} className="w-fit">
      {children}
    </Button>
  );
}

export function RegisterInput({
  label,
  ...props
}: ComponentProps<typeof Input> & { label: string }) {
  return (
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">
      {label}
      <Input {...props} />
    </label>
  );
}

export function RegisterSelect({
  label,
  children,
  ...props
}: ComponentProps<'select'> & { label: string }) {
  return (
    <label className="grid min-w-0 content-start gap-1 text-sm font-medium">
      {label}
      <select
        className="h-10 min-w-0 rounded-md border border-slate-500 bg-background px-2 focus-visible:outline-2 focus-visible:outline-offset-2"
        {...props}
      >
        {children}
      </select>
    </label>
  );
}

export function formText(data: FormData, field: string): string {
  const value = data.get(field);
  return typeof value === 'string' ? value.trim() : '';
}

export function formTimestamp(data: FormData, field: string): string | null {
  const value = formText(data, field);
  if (!value) return null;
  const time = new Date(`${value}Z`);
  return time.toISOString();
}

export function utcInputValue(iso: string | null): string {
  return iso?.slice(0, -1) ?? '';
}

function createCorrelationId() {
  if (typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6]! & 0x0f) | 0x40;
  bytes[8] = (bytes[8]! & 0x3f) | 0x80;
  const hex = Array.from(bytes, byte => byte.toString(16).padStart(2, '0')).join('');
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export function useRegisterCorrelation() {
  const last = useRef<{ fingerprint: string; id: string } | null>(null);
  return {
    forInput(input: object) {
      const fingerprint = JSON.stringify(input);
      if (last.current?.fingerprint !== fingerprint) {
        last.current = { fingerprint, id: createCorrelationId() };
      }
      return last.current.id;
    },
    clear() {
      last.current = null;
    },
  };
}
