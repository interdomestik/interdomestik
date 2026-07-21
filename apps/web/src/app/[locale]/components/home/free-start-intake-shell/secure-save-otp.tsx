'use client';

import { useNeutralEmailOtp } from '@/components/auth/use-neutral-email-otp';
import { useEffect } from 'react';
import { useTranslations } from 'next-intl';

import { parseSecureSaveCopy } from './types';

type Props = Readonly<{
  locale: string;
  onVerified: () => Promise<void>;
  tenantId?: string | null;
}>;

export function SecureSaveOtp({ locale, onVerified, tenantId }: Props) {
  const t = useTranslations('freeStart');
  const copy = parseSecureSaveCopy(t.raw('secureSave'));
  const otp = useNeutralEmailOtp({
    locale,
    onVerified,
    retryVerifiedIntent: true,
    tenantId,
  });

  useEffect(() => {
    otp.emailRef.current?.focus();
  }, [otp.emailRef]);
  useEffect(() => {
    if (!otp.destinationLocked) return;
    const frame = requestAnimationFrame(() => {
      otp.codeRef.current?.focus();

      otp.codeRef.current?.scrollIntoView({ block: 'center', behavior: 'auto' });
    });
    return () => cancelAnimationFrame(frame);
  }, [otp.codeRef, otp.destinationLocked]);

  const error = otp.error ? copy.otp.errors[otp.error] : null;
  const emailError = otp.error === 'missingEmail' || otp.error === 'sendFailed';

  return (
    <div className="mt-5 border-t border-[#001a33]/15 pt-5" data-testid="free-start-save-otp">
      <h4 className="text-lg font-bold text-[#001a33]">{copy.otp.heading}</h4>
      <p id="free-start-save-email-help" className="mt-2 text-sm leading-6 text-[#526274]">
        {copy.otp.body}
      </p>
      {otp.status === 'sent' ? (
        <p className="mt-4 text-sm text-[#173b43]" role="status" aria-live="polite">
          {copy.otp.sent.replace('{email}', otp.maskedEmail)}
        </p>
      ) : null}
      {error ? (
        <p
          id="free-start-save-error"
          className="mt-4 text-sm font-semibold text-[#8a2f43]"
          role="alert"
        >
          {error}
        </p>
      ) : null}
      <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
        <label className="grid gap-2 text-sm font-semibold text-[#001a33]">
          {copy.otp.emailLabel}
          <input
            ref={otp.emailRef}
            data-testid="free-start-save-email"
            type="email"
            autoComplete="email"
            aria-describedby={`free-start-save-email-help${emailError ? ' free-start-save-error' : ''}`}
            aria-invalid={otp.error === 'missingEmail' || undefined}
            disabled={otp.destinationLocked}
            value={otp.email}
            onChange={event => otp.setEmail(event.target.value)}
            className="min-h-11 rounded-xl border border-[#001a33]/25 bg-white px-4 text-base outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
          />
        </label>
        <button
          type="button"
          data-testid="free-start-save-send-code"
          disabled={otp.sending || otp.cooldownSeconds > 0}
          onClick={otp.send}
          className="min-h-11 rounded-xl border border-[#006f72] px-4 text-base font-bold text-[#006f72] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] disabled:opacity-60"
        >
          {otp.sending ? copy.otp.sending : copy.otp.send}
        </button>
      </div>
      {otp.destinationLocked ? (
        <div className="mt-4 grid gap-4 sm:grid-cols-[1fr_auto] sm:items-end">
          <label className="grid gap-2 text-sm font-semibold text-[#001a33]">
            {copy.otp.codeLabel}
            <input
              ref={otp.codeRef}
              data-testid="free-start-save-code"
              inputMode="numeric"
              autoComplete="one-time-code"
              aria-describedby={error ? 'free-start-save-error' : undefined}
              aria-invalid={otp.error === 'verify' || undefined}
              value={otp.code}
              onChange={event => otp.setCode(event.target.value)}
              className="min-h-11 scroll-mb-28 rounded-xl border border-[#001a33]/25 bg-white px-4 text-base tracking-[0.2em] outline-none focus-visible:ring-3 focus-visible:ring-[#008f91]"
            />
          </label>
          <button
            type="button"
            data-testid="free-start-save-verify"
            disabled={otp.verifying}
            onClick={otp.verify}
            className="min-h-11 rounded-xl bg-[#006f72] px-5 text-base font-bold text-white outline-none focus-visible:ring-3 focus-visible:ring-[#008f91] focus-visible:ring-offset-2 disabled:opacity-60"
          >
            {otp.verifying ? copy.otp.verifying : copy.otp.verify}
          </button>
        </div>
      ) : null}
      {otp.destinationLocked ? (
        <button
          type="button"
          onClick={otp.changeEmail}
          className="mt-3 min-h-11 text-sm font-bold underline"
        >
          {copy.otp.changeEmail}
        </button>
      ) : null}
    </div>
  );
}
