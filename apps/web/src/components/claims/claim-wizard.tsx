'use client';

import { submitClaim } from '@/actions/claims';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useRouter } from '@/i18n/routing';
import { ClaimsEvents } from '@/lib/analytics';
import { isUiV2Enabled } from '@/lib/flags';
import { getSupportContacts } from '@/lib/support-contacts';
import { createClaimSchema, type CreateClaimValues } from '@/lib/validators/claims';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@interdomestik/ui/components/button';
import { Form } from '@interdomestik/ui/components/form';
import { Progress } from '@interdomestik/ui/components/progress';
import * as React from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import { ArrowLeft, ArrowRight, Check, PhoneCall, Sparkles } from 'lucide-react';
import { useLocale, useTranslations } from 'next-intl';
import { WizardReview } from './wizard-review';
import { WizardStepCategory } from './wizard-step-category';
import { WizardStepDetails } from './wizard-step-details';
import { WizardStepEvidence } from './wizard-step-evidence';

type ClaimWizardProps = {
  initialCategory?: string;
};

const STEP_NAMES = ['category', 'details', 'evidence', 'review'];

const STEP_VALIDATION: Record<
  number,
  (form: UseFormReturn<CreateClaimValues>) => Promise<boolean>
> = {
  0: form => form.trigger('category'),
  1: form => form.trigger(['title', 'companyName', 'description', 'incidentDate']),
  2: async () => true,
};

export function ClaimWizard({ initialCategory }: ClaimWizardProps) {
  const router = useRouter();
  const t = useTranslations('claims.wizard');
  const tDisclaimer = useTranslations('claims.disclaimer');
  const tSuccess = useTranslations('claims.success');
  const tCommon = useTranslations('common');
  const locale = useLocale();
  const uiV2Enabled = isUiV2Enabled();
  const contacts = getSupportContacts({ locale });
  const hasTrackedOpen = React.useRef(false);

  const steps = [
    { id: 'category', title: t('step1') },
    { id: 'details', title: t('step2') },
    { id: 'evidence', title: t('step3') },
    { id: 'review', title: t('step4') },
  ];

  const [currentStep, setCurrentStep] = React.useState(initialCategory ? 1 : 0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);
  const [isLoaded, setIsLoaded] = React.useState(false);
  const [inlineError, setInlineError] = React.useState<string | null>(null);
  const [createdClaimId, setCreatedClaimId] = React.useState<string | null>(null);

  const form = useForm({
    resolver: zodResolver(createClaimSchema),
    defaultValues: {
      category: initialCategory || '',
      currency: 'EUR',
      files: [],
      title: '',
      companyName: '',
      description: '',
      claimAmount: '',
      incidentDate: '',
    },
    mode: 'onChange',
  });

  const [draft, setDraft] = useLocalStorage<CreateClaimValues | null>('claim-wizard-draft', null);

  // Track wizard opened (once)
  React.useEffect(() => {
    if (!hasTrackedOpen.current) {
      ClaimsEvents.wizardOpened();
      hasTrackedOpen.current = true;
    }
  }, []);

  React.useEffect(() => {
    if (draft && !isLoaded) {
      form.reset({ ...form.getValues(), ...draft });
      if (Object.keys(draft).length > 2) {
        toast.info(tCommon('draftRestored'), { duration: 4000 });
      }
    }
    setIsLoaded(true);
  }, [isLoaded, draft, form, tCommon]);

  React.useEffect(() => {
    if (!isLoaded) return;
    const subscription = form.watch(value => setDraft(value as CreateClaimValues));
    return () => subscription.unsubscribe();
  }, [form.watch, setDraft, isLoaded]);

  const nextStep = async (e?: React.MouseEvent) => {
    e?.preventDefault();
    console.log('[Wizard] Attempting next step from:', currentStep);
    const validator = STEP_VALIDATION[currentStep];
    try {
      if (!validator || (await validator(form as any))) {
        console.log('[Wizard] Validation passed');
        setInlineError(null);
        ClaimsEvents.stepCompleted(currentStep, STEP_NAMES[currentStep]);
        setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
      } else {
        console.log('[Wizard] Validation failed', form.formState.errors);
        if (uiV2Enabled) {
          setInlineError(t('required_fields'));
        }
      }
    } catch (err) {
      console.error('[Wizard] Validation error', err);
      if (uiV2Enabled) {
        setInlineError(t('required_fields'));
      }
    }
  };

  const prevStep = () => {
    setInlineError(null);
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  async function onSubmit(data: any) {
    setIsSubmitting(true);
    try {
      const result = await submitClaim(data);
      if (result.success) {
        ClaimsEvents.submitted('success');
        toast.success(t('submit_success'));
        setDraft(null);
        if (uiV2Enabled) {
          const payload =
            result && typeof result === 'object' && 'data' in result
              ? (result as { data?: unknown }).data
              : result;
          const claimId =
            payload && typeof payload === 'object' && 'claimId' in payload
              ? typeof (payload as { claimId?: unknown }).claimId === 'string'
                ? (payload as { claimId: string }).claimId
                : null
              : null;
          if (claimId) {
            setCreatedClaimId(claimId);
          } else {
            setCreatedClaimId('unknown-claim-id');
          }
          return;
        }
        router.push('/member/claims');
      } else {
        ClaimsEvents.failed('submission_failed');
        toast.error(t('submit_failed'));
      }
    } catch (error) {
      ClaimsEvents.failed(String(error));
      toast.error(t('submit_unexpected'));
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const progress = ((currentStep + 1) / steps.length) * 100;
  const stepProgressLabel = t('progress', {
    current: currentStep + 1,
    total: steps.length,
  });
  const nextStepLabel = uiV2Enabled
    ? currentStep === 0
      ? t('continue_details')
      : currentStep === 1
        ? t('continue_upload')
        : t('continue_review')
    : tCommon('next');
  const submitLabel = uiV2Enabled ? t('submit_label') : t('submitClaim');

  if (createdClaimId) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-8">
        <div
          data-testid="claim-created-success"
          className="space-y-4 rounded-2xl border border-emerald-200 bg-gradient-to-br from-emerald-50 to-cyan-50 p-6 text-emerald-950 shadow-[0_22px_46px_-34px_rgba(5,150,105,0.9)]"
        >
          <div className="inline-flex items-center gap-2 rounded-full border border-emerald-300/80 bg-white/70 px-3 py-1 text-xs font-semibold text-emerald-800">
            <Sparkles className="h-3.5 w-3.5" />
            {tSuccess('title')}
          </div>
          <h2 className="text-2xl font-semibold tracking-tight">{tSuccess('title')}</h2>
          <p data-testid="claim-created-id">
            {tSuccess('case_id')}: <span className="font-mono font-semibold">{createdClaimId}</span>
          </p>
          <ul
            data-testid="claim-created-next-steps"
            className="list-disc space-y-1 pl-5 text-sm leading-6"
          >
            <li>{tSuccess('next_step_1')}</li>
            <li>{tSuccess('next_step_2')}</li>
          </ul>
          <div className="flex flex-wrap gap-2">
            <a
              data-testid="claim-created-help-call"
              href={contacts.telHref}
              className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-emerald-300 bg-white/80 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-white"
            >
              <PhoneCall className="h-4 w-4" />
              {tSuccess('help_call')}
            </a>
            {contacts.whatsappHref ? (
              <a
                data-testid="claim-created-help-whatsapp"
                href={contacts.whatsappHref}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-11 items-center justify-center rounded-xl border border-emerald-300 bg-white/80 px-4 py-2 text-sm font-medium text-emerald-900 transition hover:bg-white"
              >
                {tSuccess('help_whatsapp')}
              </a>
            ) : null}
          </div>
          <a
            data-testid="claim-created-go-to-claim"
            href={`/${locale}/member/claims/${createdClaimId}`}
            className="inline-flex min-h-11 items-center justify-center rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-slate-800"
          >
            {tSuccess('go_to_claim')}
          </a>
        </div>
      </div>
    );
  }

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

      <Form {...(form as any)}>
        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-8 rounded-2xl border border-slate-200/70 bg-white/85 p-4 shadow-[0_24px_52px_-42px_rgba(15,23,42,0.85)] sm:p-6"
        >
          <div className="min-h-[400px]">
            {currentStep === 0 && <WizardStepCategory />}
            {currentStep === 1 && <WizardStepDetails />}
            {currentStep === 2 && <WizardStepEvidence />}
            {currentStep === 3 && <WizardReview />}
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
