'use client';

import { CommercialDisclaimerNotice } from '@/components/commercial/commercial-disclaimer-notice';
import { EntityDisclosureNotice } from '@/components/commercial/entity-disclosure-notice';
import { Button } from '@interdomestik/ui';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { forwardRef } from 'react';

import type { PrecheckoutConfirmationProps } from './types';

export const PrecheckoutConfirmation = forwardRef<HTMLElement, PrecheckoutConfirmationProps>(
  function PrecheckoutConfirmation(
    { plan, entityDisclosure, loading, t, onContinue, onCancel },
    ref
  ) {
    const entityDisclosureT = useTranslations('entityDisclosure');

    return (
      <section
        ref={ref}
        tabIndex={-1}
        data-testid="pricing-precheckout-confirmation"
        className="mx-auto max-w-4xl rounded-[2rem] border border-slate-200 bg-white p-6 shadow-xl"
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div className="space-y-3">
            <p className="text-xs font-black uppercase tracking-[0.2em] text-sky-700">
              {t('joinSecurely')}
            </p>
            <h2 className="text-3xl font-black tracking-tight text-slate-950">{plan.name}</h2>
            <p className="text-base font-medium text-slate-600">{plan.description}</p>
          </div>

          <div className="rounded-3xl border border-slate-200 bg-slate-50 p-5 text-left shadow-sm lg:min-w-[280px]">
            <p className="text-xs font-black uppercase tracking-[0.18em] text-slate-500">
              {t('preCheckout.planSummary')}
            </p>
            <div className="mt-3 flex items-baseline gap-1">
              <span className="text-4xl font-black tracking-tighter text-slate-950">
                {plan.price}
              </span>
              <span className="text-sm font-bold text-slate-500">{plan.period}</span>
            </div>
            <p className="mt-3 text-sm font-semibold text-emerald-700">
              {t('preCheckout.responsePromise')}
            </p>
          </div>
        </div>

        <div className="mt-6">
          <EntityDisclosureNotice
            testId="pricing-entity-disclosure"
            disclosure={entityDisclosure}
            labels={{
              title: entityDisclosureT('title'),
              contractingCompany: entityDisclosureT('contractingCompany'),
              governingLaw: entityDisclosureT('governingLaw'),
              unavailableTitle: entityDisclosureT('unavailableTitle'),
              unavailableBody: entityDisclosureT('unavailableBody'),
            }}
          />
        </div>

        <div className="mt-6">
          <CommercialDisclaimerNotice
            eyebrow={t('disclaimers.eyebrow')}
            items={[
              {
                title: t('disclaimers.freeStart.title'),
                body: t('disclaimers.freeStart.body'),
              },
            ]}
          />
        </div>

        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          <Button
            size="lg"
            data-testid="precheckout-continue-cta"
            className="min-h-[44px] touch-manipulation rounded-2xl px-6"
            disabled={loading}
            onClick={onContinue}
          >
            {loading ? <Loader2 className="mr-2 h-5 w-5 animate-spin" /> : null}
            {t('preCheckout.continue')}
          </Button>
          <Button
            size="lg"
            data-testid="precheckout-cancel-cta"
            variant="outline"
            className="min-h-[44px] touch-manipulation rounded-2xl px-6"
            onClick={onCancel}
          >
            {t('preCheckout.cancel')}
          </Button>
        </div>
      </section>
    );
  }
);
