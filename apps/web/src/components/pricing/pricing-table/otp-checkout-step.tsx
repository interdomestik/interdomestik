'use client';

import { Button } from '@interdomestik/ui';
import { Loader2 } from 'lucide-react';
import { forwardRef } from 'react';

import type { OtpCheckoutStepProps } from './types';

export const OtpCheckoutStep = forwardRef<HTMLElement, OtpCheckoutStepProps>(
  function OtpCheckoutStep(
    {
      plan,
      email,
      code,
      error,
      success,
      sending,
      verifying,
      t,
      onEmailChange,
      onCodeChange,
      onSend,
      onBack,
      onVerify,
    },
    ref
  ) {
    return (
      <section
        ref={ref}
        tabIndex={-1}
        data-testid="pricing-otp-step"
        className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="space-y-2">
          <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">
            {t('joinSecurely')}
          </p>
          <h2 className="text-3xl font-black tracking-tight text-slate-950">
            {t('otpStep.title')}
          </h2>
          <p className="text-base font-medium text-slate-600">
            {t('otpStep.subtitle', { planName: plan.name })}
          </p>
        </div>

        <div className="mt-6 space-y-4">
          <label className="block space-y-2">
            <span className="text-sm font-bold text-slate-700">{t('otpStep.emailLabel')}</span>
            <input
              data-testid="pricing-otp-email-input"
              type="email"
              value={email}
              onChange={event => onEmailChange(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base"
              placeholder={t('otpStep.emailPlaceholder')}
              autoComplete="email"
            />
          </label>

          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              data-testid="pricing-otp-send-cta"
              className="min-h-[44px] touch-manipulation rounded-2xl px-6"
              disabled={sending}
              onClick={onSend}
            >
              {sending ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
              {t('otpStep.send')}
            </Button>
            <Button
              type="button"
              variant="outline"
              className="min-h-[44px] touch-manipulation rounded-2xl px-6"
              onClick={onBack}
            >
              {t('otpStep.back')}
            </Button>
          </div>

          <label className="block space-y-2">
            <span className="text-sm font-bold text-slate-700">{t('otpStep.codeLabel')}</span>
            <input
              data-testid="pricing-otp-code-input"
              type="text"
              value={code}
              onChange={event => onCodeChange(event.target.value)}
              className="w-full rounded-2xl border border-slate-200 px-4 py-3 text-base tracking-[0.3em]"
              placeholder={t('otpStep.codePlaceholder')}
              inputMode="numeric"
              autoComplete="one-time-code"
            />
          </label>

          <Button
            type="button"
            data-testid="pricing-otp-verify-cta"
            className="min-h-[44px] touch-manipulation rounded-2xl px-6"
            disabled={verifying}
            onClick={onVerify}
          >
            {verifying ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {t('otpStep.verify')}
          </Button>

          {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
          {success ? <p className="text-sm font-medium text-emerald-700">{success}</p> : null}
        </div>
      </section>
    );
  }
);
