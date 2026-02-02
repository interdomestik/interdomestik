'use client';

import { submitClaim } from '@/actions/claims';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useRouter } from '@/i18n/routing';
import { ClaimsEvents } from '@/lib/analytics';
import { createClaimSchema, type CreateClaimValues } from '@/lib/validators/claims';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@interdomestik/ui/components/button';
import { Form } from '@interdomestik/ui/components/form';
import { Progress } from '@interdomestik/ui/components/progress';
import * as React from 'react';
import { useForm, type UseFormReturn } from 'react-hook-form';
import { toast } from 'sonner';

import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
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
  const tCommon = useTranslations('common');
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
        ClaimsEvents.stepCompleted(currentStep, STEP_NAMES[currentStep]);
        setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
      } else {
        console.log('[Wizard] Validation failed', form.formState.errors);
      }
    } catch (err) {
      console.error('[Wizard] Validation error', err);
    }
  };

  const prevStep = () => setCurrentStep(prev => Math.max(prev - 1, 0));

  async function onSubmit(data: any) {
    setIsSubmitting(true);
    try {
      const result = await submitClaim(data);
      if (result.success) {
        ClaimsEvents.submitted('success');
        toast.success('Claim submitted successfully!');
        setDraft(null);
        router.push('/member/claims');
      } else {
        ClaimsEvents.failed('submission_failed');
        toast.error('Failed to submit, please try again.');
      }
    } catch (error) {
      ClaimsEvents.failed(String(error));
      toast.error('An unexpected error occurred.');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  const progress = ((currentStep + 1) / steps.length) * 100;

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      <div className="mb-8 space-y-2">
        <div className="flex justify-between text-sm font-medium text-muted-foreground">
          <span>
            Step {currentStep + 1} of {steps.length}
          </span>
          <span>{steps[currentStep].title}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <Form {...(form as any)}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
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
                {tCommon('next')}
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
                    {t('submitClaim')}
                    <Check className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            )}
          </div>
        </form>
      </Form>
    </div>
  );
}
