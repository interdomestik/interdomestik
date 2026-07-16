'use client';

import { contactInfo } from '@/lib/contact';
import { Button } from '@interdomestik/ui';
import { forwardRef } from 'react';

import { OTP_ACTION_CLASS, PricingOtpContent } from './pricing-table-content';
import type { OtpCheckoutStepProps } from './types';

export const OtpCheckoutStep = forwardRef<HTMLHeadingElement, OtpCheckoutStepProps>(
  function OtpCheckoutStep(props, headingRef) {
    const busy = props.sending || props.verifying;
    const errorText = props.error ? props.t(`otpStep.errors.${props.error}`) : null;
    const showSupport = ['sendFailed', 'verify', 'accountStop'].includes(props.error ?? '');

    return (
      <section
        data-testid="pricing-otp-step"
        aria-labelledby="pricing-otp-heading"
        className="mx-auto max-w-3xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl forced-colors:border"
      >
        <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">
          {props.t('joinSecurely')}
        </p>
        <h2
          ref={headingRef}
          id="pricing-otp-heading"
          tabIndex={-1}
          className="mt-2 text-3xl font-black tracking-tight text-slate-950 focus-visible:outline forced-colors:outline"
        >
          {props.t('otpStep.title')}
        </h2>
        <p
          id="pricing-otp-truth"
          className="mt-3 text-base text-slate-700 [overflow-wrap:anywhere]"
        >
          {props.t('otpStep.truth')}
        </p>

        <div className="mt-6 space-y-4">
          <PricingOtpContent {...props} />
          {errorText ? (
            <p id="pricing-otp-error" role="alert" className="text-sm font-semibold text-red-700">
              {errorText}
            </p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <Button
              type="button"
              variant="outline"
              className={OTP_ACTION_CLASS}
              disabled={busy}
              onClick={props.onBack}
            >
              {props.t('preCheckout.cancel')}
            </Button>
            {showSupport ? (
              <a
                href={contactInfo.telHref}
                className={`${OTP_ACTION_CLASS} inline-flex items-center justify-center border border-slate-400 font-semibold`}
              >
                {props.t('disclaimers.hotline.title')}
              </a>
            ) : null}
          </div>
        </div>
      </section>
    );
  }
);
