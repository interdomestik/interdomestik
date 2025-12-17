'use client';

import { submitClaim } from '@/actions/claims';
import { useRouter } from '@/i18n/routing';
import { createClaimSchema, type CreateClaimValues } from '@/lib/validators/claims';
import { zodResolver } from '@hookform/resolvers/zod';
import { Button } from '@interdomestik/ui/components/button';
import { Form } from '@interdomestik/ui/components/form';
import { Progress } from '@interdomestik/ui/components/progress';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { ArrowLeft, ArrowRight, Check } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { WizardReview } from './wizard-review';
import { WizardStepCategory } from './wizard-step-category';
import { WizardStepDetails } from './wizard-step-details';
import { WizardStepEvidence } from './wizard-step-evidence';

export function ClaimWizard() {
  const router = useRouter();
  const t = useTranslations('claims.wizard');
  const tCommon = useTranslations('common');

  const steps = [
    { id: 'category', title: t('step1') },
    { id: 'details', title: t('step2') },
    { id: 'evidence', title: t('step3') },
    { id: 'review', title: t('step4') },
  ];

  const [currentStep, setCurrentStep] = React.useState(0);
  const [isSubmitting, setIsSubmitting] = React.useState(false);

  const form = useForm({
    resolver: zodResolver(createClaimSchema),
    defaultValues: {
      currency: 'EUR',
      files: [],
      // defaults for other fields to avoid uncontrolled components
      title: '',
      companyName: '',
      description: '',
      claimAmount: '',
      incidentDate: '',
    },
    mode: 'onChange',
  });

  // Calculate progress
  const progress = ((currentStep + 1) / steps.length) * 100;

  const nextStep = async () => {
    // Validate current step fields before moving
    let valid = false;
    if (currentStep === 0) valid = await form.trigger('category');
    if (currentStep === 1)
      valid = await form.trigger(['title', 'companyName', 'description', 'incidentDate']);
    if (currentStep === 2) valid = true; // Evidence optional

    if (valid) {
      setCurrentStep(prev => Math.min(prev + 1, steps.length - 1));
    }
  };

  const prevStep = () => {
    setCurrentStep(prev => Math.max(prev - 1, 0));
  };

  async function onSubmit(data: CreateClaimValues) {
    setIsSubmitting(true);
    try {
      const result = await submitClaim(data);
      if (result.success) {
        toast.success('Claim submitted successfully!');
        router.push('/dashboard/claims');
      } else {
        toast.error('Failed to submit, please try again.');
        // console.error(result.error);
      }
    } catch (error) {
      toast.error('An unexpected error occurred.');
      console.error(error);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto py-8 px-4">
      {/* Progress Bar */}
      <div className="mb-8 space-y-2">
        <div className="flex justify-between text-sm font-medium text-muted-foreground">
          <span>
            Step {currentStep + 1} of {steps.length}
          </span>
          <span>{steps[currentStep].title}</span>
        </div>
        <Progress value={progress} className="h-2" />
      </div>

      <Form {...form}>
        <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-8">
          {/* Step Content */}
          <div className="min-h-[400px]">
            {currentStep === 0 && <WizardStepCategory />}
            {currentStep === 1 && <WizardStepDetails />}
            {currentStep === 2 && <WizardStepEvidence />}
            {currentStep === 3 && <WizardReview />}
          </div>

          {/* Navigation Buttons */}
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
              <Button type="button" onClick={nextStep} data-testid="wizard-next">
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
                  <>{tCommon('processing')}</>
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
