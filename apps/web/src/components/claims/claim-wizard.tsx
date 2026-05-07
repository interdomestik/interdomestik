'use client';

import { submitClaim } from '@/actions/claims.core';
import { useLocalStorage } from '@/hooks/use-local-storage';
import { useRouter } from '@/i18n/routing';
import {
  ClaimsEvents,
  CommercialFunnelEvents,
  FunnelEvents,
  resolveFunnelVariant,
} from '@/lib/analytics';
import { createClientRequestId } from '@/lib/client-request-id';
import { isUiV2Enabled } from '@/lib/flags';
import { getSupportContacts } from '@/lib/support-contacts';
import { createClaimSchema, type CreateClaimValues } from '@/lib/validators/claims';
import { zodResolver } from '@hookform/resolvers/zod';
import * as React from 'react';
import { useForm } from 'react-hook-form';
import { toast } from 'sonner';

import { useLocale, useTranslations } from 'next-intl';
import {
  getCommercialFlowFromResult,
  getEscalationDecision,
  getStringPayloadValue,
} from './claim-wizard/commercial-flow';
import { ClaimCreatedSuccess } from './claim-wizard/success-state';
import type { ClaimWizardReadonlyProps, ClaimWizardStep } from './claim-wizard/types';
import {
  getClaimWizardDefaultValues,
  STEP_NAMES,
  STEP_VALIDATION,
} from './claim-wizard/validation';
import { ClaimWizardShell } from './claim-wizard/wizard-shell';

export function ClaimWizard({
  initialCategory,
  tenantId,
  handoffContext,
}: ClaimWizardReadonlyProps) {
  const router = useRouter();
  const t = useTranslations('claims.wizard');
  const tDisclaimer = useTranslations('claims.disclaimer');
  const tSuccess = useTranslations('claims.success');
  const tCommon = useTranslations('common');
  const tDiaspora = useTranslations('diaspora');
  const locale = useLocale();
  const uiV2Enabled = isUiV2Enabled();
  const contacts = getSupportContacts({ locale });
  const hasTrackedOpen = React.useRef(false);

  const steps: ClaimWizardStep[] = [
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
  const [createdClaimNumber, setCreatedClaimNumber] = React.useState<string | null>(null);
  const submitKeyRef = React.useRef<string | null>(null);

  const form = useForm<CreateClaimValues>({
    resolver: zodResolver<CreateClaimValues>(createClaimSchema),
    defaultValues: getClaimWizardDefaultValues(initialCategory),
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
      if (!validator || (await validator(form))) {
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

  async function onSubmit(data: CreateClaimValues) {
    setIsSubmitting(true);
    try {
      const submitKey = submitKeyRef.current ?? createClientRequestId();
      submitKeyRef.current = submitKey;
      const result = await submitClaim(data, submitKey, handoffContext ?? undefined);
      if (result.success) {
        ClaimsEvents.submitted('success');
        const payload =
          result && typeof result === 'object' && 'data' in result
            ? (result as { data?: unknown }).data
            : result;
        const claimId = getStringPayloadValue(payload, 'claimId');
        const claimNumber = getStringPayloadValue(payload, 'claimNumber');
        const commercialFlow = getCommercialFlowFromResult(payload);
        const normalizedClaimId = claimId ?? 'unknown-claim-id';
        const normalizedCategory =
          commercialFlow?.freeStartCompletion?.claimCategory?.trim().toLowerCase() ||
          (typeof data.category === 'string' && data.category.trim().length > 0
            ? data.category.trim().toLowerCase()
            : 'unknown');
        const funnelContext = {
          tenantId: tenantId ?? null,
          variant: resolveFunnelVariant(uiV2Enabled),
          locale,
        };

        FunnelEvents.firstClaimSubmitted(funnelContext, { claim_id: normalizedClaimId });
        CommercialFunnelEvents.freeStartCompleted(funnelContext, {
          claim_id: normalizedClaimId,
          claim_category: normalizedCategory,
        });

        const escalationDecision = getEscalationDecision(commercialFlow, normalizedCategory);

        if (escalationDecision.decision === 'requested') {
          CommercialFunnelEvents.escalationRequested(funnelContext, {
            claim_id: normalizedClaimId,
            claim_category: normalizedCategory,
            decision_reason: escalationDecision.decisionReason,
          });
        } else {
          CommercialFunnelEvents.escalationDeclined(funnelContext, {
            claim_id: normalizedClaimId,
            claim_category: normalizedCategory,
            decision_reason: escalationDecision.decisionReason,
          });
        }
        toast.success(t('submit_success'));
        setDraft(null);
        if (uiV2Enabled) {
          if (claimId) {
            setCreatedClaimId(claimId);
            setCreatedClaimNumber(claimNumber ?? claimId);
          } else {
            console.error('[Wizard] Claim submission succeeded but no claimId was returned', {
              payload,
            });
            setCreatedClaimId('unknown-claim-id');
            setCreatedClaimNumber('unknown-claim-id');
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
      submitKeyRef.current = null;
      setIsSubmitting(false);
    }
  }

  const progress = ((currentStep + 1) / steps.length) * 100;
  const stepProgressLabel = t('progress', {
    current: currentStep + 1,
    total: steps.length,
  });
  const submitLabel = uiV2Enabled ? t('submit_label') : t('submitClaim');
  const handoffCountryLabel = handoffContext
    ? tDiaspora(`selector.options.${handoffContext.country}`)
    : null;

  if (createdClaimId && createdClaimNumber) {
    return (
      <ClaimCreatedSuccess
        claimId={createdClaimId}
        claimNumber={createdClaimNumber}
        locale={locale}
        contacts={contacts}
        tSuccess={tSuccess}
      />
    );
  }

  return (
    <ClaimWizardShell
      contacts={contacts}
      form={form}
      handoffContext={handoffContext}
      handoffCountryLabel={handoffCountryLabel}
      inlineError={inlineError}
      isSubmitting={isSubmitting}
      navigation={{
        currentStep,
        nextStep,
        prevStep,
        progress,
        stepProgressLabel,
        steps,
        submitLabel,
      }}
      onSubmit={onSubmit}
      uiV2Enabled={uiV2Enabled}
      translations={{ t, tCommon, tDisclaimer }}
    />
  );
}
