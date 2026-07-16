'use client';

import { Button } from '@interdomestik/ui';
import { Loader2 } from 'lucide-react';

import type { OtpCheckoutStepProps } from './types';

export const OTP_ACTION_CLASS =
  'min-h-[44px] touch-manipulation rounded-2xl px-6 forced-colors:outline';
const INPUT_CLASS =
  'w-full rounded-2xl border border-slate-300 px-4 py-3 text-base focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-700 forced-colors:border';

export function PricingOtpContent(props: OtpCheckoutStepProps) {
  const busy = props.sending || props.verifying;
  const errorId = props.error ? 'pricing-otp-error' : undefined;

  return (
    <>
      {props.destinationLocked ? (
        <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4 forced-colors:border">
          <p className="text-sm font-bold text-slate-700">{props.t('otpStep.emailLabel')}</p>
          <p className="mt-1 font-semibold text-slate-950 [overflow-wrap:anywhere]">
            {props.maskedEmail}
          </p>
          <Button
            type="button"
            variant="outline"
            className={`${OTP_ACTION_CLASS} mt-3`}
            disabled={busy}
            onClick={props.onChangeEmail}
          >
            {props.t('otpStep.changeEmail')}
          </Button>
        </div>
      ) : (
        <>
          <label htmlFor="pricing-otp-email" className="block space-y-2">
            <span className="text-sm font-bold text-slate-700">
              {props.t('otpStep.emailLabel')}
            </span>
            <input
              ref={props.emailRef}
              id="pricing-otp-email"
              data-testid="pricing-otp-email-input"
              type="email"
              value={props.email}
              onChange={event => props.onEmailChange(event.target.value)}
              className={INPUT_CLASS}
              placeholder="name@example.com"
              autoComplete="email"
              aria-invalid={props.error === 'missingEmail' || props.error === 'sendFailed'}
              aria-describedby={['pricing-otp-truth', errorId].filter(Boolean).join(' ')}
            />
          </label>
          <Button
            type="button"
            data-testid="pricing-otp-send-cta"
            className={OTP_ACTION_CLASS}
            disabled={busy || props.cooldownSeconds > 0}
            aria-busy={props.sending}
            onClick={props.onSend}
          >
            {props.sending ? <PendingIcon /> : null}
            {props.t(props.cooldownSeconds > 0 ? 'otpStep.resendCooldown' : 'otpStep.send', {
              seconds: props.cooldownSeconds,
            })}
          </Button>
        </>
      )}
      {props.status === 'sent' ? (
        <p
          id="pricing-otp-status"
          role="status"
          aria-live="polite"
          className="text-sm font-medium text-emerald-800"
        >
          {props.t('otpStep.sent')}
        </p>
      ) : null}
      <label htmlFor="pricing-otp-code" className="block space-y-2">
        <span className="text-sm font-bold text-slate-700">{props.t('otpStep.codeLabel')}</span>
        <input
          ref={props.codeRef}
          id="pricing-otp-code"
          data-testid="pricing-otp-code-input"
          type="text"
          value={props.code}
          onChange={event => props.onCodeChange(event.target.value)}
          disabled={!props.destinationLocked || busy}
          className={`${INPUT_CLASS} tracking-[0.3em]`}
          placeholder="123456"
          inputMode="numeric"
          autoComplete="one-time-code"
          aria-invalid={props.error === 'verify'}
          aria-describedby={['pricing-otp-status', errorId].filter(Boolean).join(' ')}
        />
      </label>
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap">
        <Button
          type="button"
          data-testid="pricing-otp-verify-cta"
          className={OTP_ACTION_CLASS}
          disabled={busy || !props.destinationLocked || props.error === 'accountStop'}
          aria-busy={props.verifying}
          onClick={props.onVerify}
        >
          {props.verifying ? <PendingIcon /> : null}
          {props.t('otpStep.verify')}
        </Button>
        {props.destinationLocked ? (
          <Button
            type="button"
            variant="outline"
            className={OTP_ACTION_CLASS}
            disabled={busy || props.cooldownSeconds > 0}
            aria-busy={props.sending}
            onClick={props.onResend}
          >
            {props.sending ? <PendingIcon /> : null}
            {props.t(props.cooldownSeconds > 0 ? 'otpStep.resendCooldown' : 'otpStep.resend', {
              seconds: props.cooldownSeconds,
            })}
          </Button>
        ) : null}
      </div>
    </>
  );
}

function PendingIcon() {
  return (
    <Loader2 aria-hidden="true" className="mr-2 h-5 w-5 animate-spin motion-reduce:animate-none" />
  );
}
