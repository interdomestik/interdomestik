import * as React from 'react';
import type { useTranslations } from 'next-intl';
import type { UseFormReturn } from 'react-hook-form';

import { Button } from '@interdomestik/ui/components/button';
import { Form } from '@interdomestik/ui/components/form';
import { Progress } from '@interdomestik/ui/components/progress';
import { ArrowLeft, ArrowRight, Check } from 'lucide-react';

import type { CreateClaimValues } from '@/lib/validators/claims';

import { ClaimWizardHandoffSummary } from './handoff-summary';
import { ClaimWizardStepContent } from './step-content';
import type { ClaimWizardHandoffContext, ClaimWizardStep } from './types';

type SupportContacts = {
  telHref: string;
  whatsappHref?: string | null;
};

export function getNextStepLabel(params: {
  currentStep: number;
  uiV2Enabled: boolean;
  t: ReturnType<typeof useTranslations>;
  tCommon: ReturnType<typeof useTranslations>;
}): string {
  const { currentStep, uiV2Enabled, t, tCommon } = params;

  if (!uiV2Enabled) {
    return tCommon('next');
  }

  if (currentStep === 0) {
    return t('continue_details');
  }

  if (currentStep === 1) {
    return t('continue_upload');
  }

  return t('continue_review');
}

export function ClaimWizardShell(
  props: Readonly<{
    contacts: SupportContacts;
    form: UseFormReturn<CreateClaimValues>;
    handoffContext?: ClaimWizardHandoffContext | null;
    handoffCountryLabel: string | null;
    inlineError: string | null;
    isSubmitting: boolean;
    navigation: {
      currentStep: number;
      nextStep: (e?: React.MouseEvent) => Promise<void>;
      prevStep: () => void;
      progress: number;
      stepProgressLabel: string;
      steps: ClaimWizardStep[];
      submitLabel: string;
    };
    onSubmit: (data: CreateClaimValues) => Promise<void>;
    uiV2Enabled: boolean;
    translations: {
      t: ReturnType<typeof useTranslations>;
      tCommon: ReturnType<typeof useTranslations>;
      tDisclaimer: ReturnType<typeof useTranslations>;
    };
  }>
): React.JSX.Element {
  const {
    contacts,
    form,
    handoffContext,
    handoffCountryLabel,
    inlineError,
    isSubmitting,
    navigation,
    onSubmit,
    uiV2Enabled,
  } = props;
  const { currentStep, nextStep, prevStep, progress, stepProgressLabel, steps, submitLabel } =
    navigation;
  const { t, tCommon, tDisclaimer } = props.translations;
  const nextStepLabel = getNextStepLabel({ currentStep, uiV2Enabled, t, tCommon });

  return (
    <div className="mx-auto max-w-3xl px-4 py-8">
      <div className="mb-8 space-y-2">
        {uiV2Enabled ? (
          <div
            data-testid="claim-wizard-help"
            className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/90 px-3 py-2 text-xs text-muted-foreground shadow-[0_16px_32px_-30px_rgba(15,23,42,0.75)]"
          >
            <span>{t('help.title')}</span>
            <a
              data-testid="claim-wizard-help-call"
              href={contacts.telHref}
              className="inline-flex min-h-8 items-center rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium hover:bg-slate-100"
            >
              {t('help.call_60s')}
            </a>
            {contacts.whatsappHref ? (
              <a
                data-testid="claim-wizard-help-whatsapp"
                href={contacts.whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-8 items-center rounded-full border border-slate-300 bg-slate-50 px-2.5 py-1 text-xs font-medium hover:bg-slate-100"
              >
                {t('help.whatsapp')}
              </a>
            ) : null}
          </div>
        ) : null}
        <div className="flex items-center justify-between text-sm font-medium text-muted-foreground">
          <span>{stepProgressLabel}</span>
          <span>{steps[currentStep].title}</span>
        </div>
        <Progress value={progress} className="h-2.5 rounded-full bg-slate-100" />
      </div>

      <Form {...form}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8 rounded-2xl border border-slate-200/70 bg-white/85 p-4 shadow-[0_24px_52px_-42px_rgba(15,23,42,0.85)] sm:p-6"
        >
          {handoffContext && handoffCountryLabel ? (
            <ClaimWizardHandoffSummary
              handoffContext={handoffContext}
              handoffCountryLabel={handoffCountryLabel}
              t={t}
            />
          ) : null}
          <div className="min-h-[400px]">
            <ClaimWizardStepContent currentStep={currentStep} />
          </div>

          <div className="flex justify-between pt-4 border-t">
            <Button
              type="button"
              variant="outline"
              onClick={prevStep}
              disabled={currentStep === 0 || isSubmitting}
              className={currentStep === 0 ? 'invisible' : ''}
              data-testid="wizard-back"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              {tCommon('back')}
            </Button>

            {currentStep < steps.length - 1 ? (
              <Button type="button" onClick={e => nextStep(e)} data-testid="wizard-next">
                {nextStepLabel}
                <ArrowRight className="ml-2 h-4 w-4" />
              </Button>
            ) : (
              <Button
                type="submit"
                disabled={isSubmitting}
                className="min-w-[140px]"
                data-testid="wizard-submit"
              >
                {isSubmitting ? (
                  tCommon('processing')
                ) : (
                  <>
                    {submitLabel}
                    <Check className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
          {inlineError ? (
            <div
              data-testid="wizard-inline-error"
              className="rounded-md border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
            >
              {inlineError}
            </div>
          ) : null}
          {uiV2Enabled ? (
            <div
              data-testid="claims-wizard-disclaimer"
              className="rounded-md border bg-muted/30 px-4 py-3 text-xs text-muted-foreground space-y-1"
            >
              <p>{tDisclaimer('not_insurer')}</p>
              <p>{tDisclaimer('insurer_decides')}</p>
              <p>{tDisclaimer('privacy')}</p>
            </div>
          ) : null}
        </form>
      </Form>
    </div>
  );
}
