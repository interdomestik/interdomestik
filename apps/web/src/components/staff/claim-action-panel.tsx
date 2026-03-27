'use client';

import {
  AcceptedRecoveryPrerequisitesSnapshot,
  assignClaim,
  ClaimEscalationAgreementSnapshot,
  ClaimStatus,
  EscalationDecisionNextStatus,
  PaymentAuthorizationState,
  RecoveryDeclineReasonCode,
  RecoveryDecisionSnapshot,
  saveRecoveryDecision,
  saveClaimEscalationAgreement,
  saveSuccessFeeCollection,
  SuccessFeeCollectionSnapshot,
  updateClaimStatus,
} from '@/actions/staff-claims.core';
import { CLAIM_STATUSES as CANONICAL_CLAIM_STATUSES } from '@interdomestik/database/constants';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@interdomestik/ui';
import { Loader2 } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';
import { toast } from 'sonner';

interface ClaimActionPanelProps {
  readonly acceptedRecoveryPrerequisites: AcceptedRecoveryPrerequisitesSnapshot;
  readonly claimId: string;
  readonly recoveryDecision: RecoveryDecisionSnapshot;
  readonly commercialAgreement: ClaimEscalationAgreementSnapshot | null;
  readonly successFeeCollection: SuccessFeeCollectionSnapshot | null;
  readonly currentStatus: string;
  readonly staffId: string;
  readonly assigneeId: string | null;
  readonly assignmentOptions: ReadonlyArray<{
    id: string;
    label: string;
  }>;
  readonly currentAssigneeLabel?: string | null;
}

type AssignmentOption = {
  id: string;
  label: string;
};

type RenderedAssignmentOption = AssignmentOption & {
  disabled?: boolean;
};

type TranslateFn = (key: string, values?: Record<string, string | number>) => string;

const RECOVERY_START_STATUSES: ReadonlySet<ClaimStatus> = new Set(['negotiation', 'court']);

function getDefaultDecisionNextStatus(currentStatus: string): EscalationDecisionNextStatus {
  return currentStatus === 'court' ? 'court' : 'negotiation';
}

function getRecoveryDeclineReasonOptions(t: TranslateFn) {
  return [
    {
      value: 'guidance_only_scope' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.guidance_only_scope'),
    },
    {
      value: 'insufficient_evidence' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.insufficient_evidence'),
    },
    {
      value: 'no_monetary_recovery_path' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.no_monetary_recovery_path'),
    },
    {
      value: 'counterparty_unidentified' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.counterparty_unidentified'),
    },
    {
      value: 'time_limit_risk' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.time_limit_risk'),
    },
    {
      value: 'conflict_or_integrity_concern' as const,
      label: t('staff_actions.recovery_decision.decline_reasons.conflict_or_integrity_concern'),
    },
  ];
}

function formatCollectionMethodLabel(
  method: SuccessFeeCollectionSnapshot['collectionMethod'],
  t: TranslateFn
) {
  switch (method) {
    case 'deduction':
      return t('staff_actions.success_fee.collection_method_options.deduction');
    case 'payment_method_charge':
      return t('staff_actions.success_fee.collection_method_options.payment_method_charge');
    case 'invoice':
      return t('staff_actions.success_fee.collection_method_options.invoice');
    default:
      return method;
  }
}

function getPaymentAuthorizationLabel(value: PaymentAuthorizationState, t: TranslateFn) {
  return t(`staff_actions.escalation_agreement.payment_authorization_options.${value}`);
}

const utcDateTimeFormatter = new Intl.DateTimeFormat('en-GB', {
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'UTC',
});

function formatUtcDateTime(value: string | null | undefined, t: TranslateFn) {
  if (!value) return t('staff_actions.common.pending');
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return t('staff_actions.common.pending');
  return `${utcDateTimeFormatter.format(parsed)} UTC`;
}

function hasAssignmentOption(
  assignmentOptions: ReadonlyArray<AssignmentOption>,
  assigneeId: string
) {
  return assignmentOptions.some(option => option.id === assigneeId);
}

function getSelectedAssigneeId(args: {
  assignmentOptions: ReadonlyArray<AssignmentOption>;
  assigneeId: string | null;
  staffId: string;
}) {
  if (args.assigneeId !== null) {
    return args.assigneeId;
  }

  if (hasAssignmentOption(args.assignmentOptions, args.staffId)) {
    return args.staffId;
  }

  return args.assignmentOptions[0]?.id ?? '';
}

function getOutOfScopeAssigneeOption(args: {
  assignmentOptions: ReadonlyArray<AssignmentOption>;
  assigneeId: string | null;
  currentAssigneeLabel?: string | null;
  t: TranslateFn;
}): RenderedAssignmentOption | null {
  if (args.assigneeId === null || hasAssignmentOption(args.assignmentOptions, args.assigneeId)) {
    return null;
  }

  return {
    id: args.assigneeId,
    label: args.t('staff_actions.assignment.out_of_scope', {
      name: args.currentAssigneeLabel ?? args.t('staff_actions.assignment.current_assignee'),
    }),
    disabled: true,
  };
}

function getAssignmentSuccessDescription(args: {
  nextAssigneeId: string | null;
  selectedAssignmentLabel: string | null;
  staffId: string;
  t: TranslateFn;
}) {
  if (args.nextAssigneeId === args.staffId) {
    return args.t('staff_actions.success.assignment_self');
  }

  if (args.selectedAssignmentLabel) {
    return args.t('staff_actions.success.assignment_named', {
      name: args.selectedAssignmentLabel,
    });
  }

  return args.t('staff_actions.success.assignment_updated');
}

function getAssignmentLabel(args: {
  assigneeId: string | null;
  currentAssigneeLabel?: string | null;
  isAssignedToMe: boolean;
  t: TranslateFn;
}) {
  if (args.assigneeId === null) {
    return args.t('staff_actions.assignment.unassigned');
  }

  if (args.isAssignedToMe) {
    return args.t('staff_actions.assignment.assigned_to_you');
  }

  if (args.currentAssigneeLabel) {
    return args.t('staff_actions.assignment.assigned_to_named', {
      name: args.currentAssigneeLabel,
    });
  }

  return args.t('staff_actions.assignment.assigned_to_colleague');
}

export function ClaimActionPanel({
  acceptedRecoveryPrerequisites,
  claimId,
  recoveryDecision,
  commercialAgreement,
  successFeeCollection,
  currentStatus,
  staffId,
  assigneeId,
  assignmentOptions,
  currentAssigneeLabel,
}: ClaimActionPanelProps) {
  const t = useTranslations('agent-claims.claims');
  const tStatus = useTranslations('claims-tracking.status');
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [decisionExplanation, setDecisionExplanation] = useState(
    recoveryDecision.explanation ?? ''
  );
  const [declineReasonCode, setDeclineReasonCode] = useState<RecoveryDeclineReasonCode | ''>(
    recoveryDecision.status === 'declined' ? (recoveryDecision.declineReasonCode ?? '') : ''
  );
  const [allowanceOverrideReason, setAllowanceOverrideReason] = useState('');
  const decisionSaveKeyRef = useRef<string | null>(null);
  const agreementSaveKeyRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ClaimStatus>(currentStatus as ClaimStatus);
  const [savedRecoveryDecision, setSavedRecoveryDecision] =
    useState<RecoveryDecisionSnapshot>(recoveryDecision);
  const [savedAgreement, setSavedAgreement] = useState<ClaimEscalationAgreementSnapshot | null>(
    commercialAgreement
  );
  const [savedSuccessFeeCollection, setSavedSuccessFeeCollection] =
    useState<SuccessFeeCollectionSnapshot | null>(successFeeCollection);
  const [decisionNextStatus, setDecisionNextStatus] = useState<EscalationDecisionNextStatus>(
    commercialAgreement?.decisionNextStatus ?? getDefaultDecisionNextStatus(currentStatus)
  );
  const [decisionReason, setDecisionReason] = useState(commercialAgreement?.decisionReason ?? '');
  const [feePercentage, setFeePercentage] = useState(
    commercialAgreement?.feePercentage.toString() ?? ''
  );
  const [minimumFee, setMinimumFee] = useState(commercialAgreement?.minimumFee ?? '25.00');
  const [legalActionCapPercentage, setLegalActionCapPercentage] = useState(
    commercialAgreement?.legalActionCapPercentage.toString() ?? ''
  );
  const [paymentAuthorizationState, setPaymentAuthorizationState] =
    useState<PaymentAuthorizationState>(
      commercialAgreement?.paymentAuthorizationState ?? 'pending'
    );
  const [termsVersion, setTermsVersion] = useState(commercialAgreement?.termsVersion ?? '');
  const [recoveredAmount, setRecoveredAmount] = useState(
    successFeeCollection?.recoveredAmount ?? ''
  );
  const [deductionPath, setDeductionPath] = useState(
    successFeeCollection?.deductionAllowed ? 'allowed' : 'fallback'
  );
  const [selectedAssigneeId, setSelectedAssigneeId] = useState(() =>
    getSelectedAssigneeId({ assignmentOptions, assigneeId, staffId })
  );
  const router = useRouter();
  const recoveryDeclineReasonOptions = getRecoveryDeclineReasonOptions(t);
  const claimStatusOptions = CANONICAL_CLAIM_STATUSES.map(status => ({
    value: status as ClaimStatus,
    label: tStatus(status),
  }));
  const escalationDecisionStatusOptions = [
    { value: 'negotiation' as const, label: tStatus('negotiation') },
    { value: 'court' as const, label: tStatus('court') },
  ];

  useEffect(() => {
    setSavedRecoveryDecision(recoveryDecision);
    setDecisionExplanation(recoveryDecision.explanation ?? '');
    setDeclineReasonCode(
      recoveryDecision.status === 'declined' ? (recoveryDecision.declineReasonCode ?? '') : ''
    );
    setSavedAgreement(commercialAgreement);
    setSavedSuccessFeeCollection(successFeeCollection);
    setDecisionNextStatus(
      commercialAgreement?.decisionNextStatus ?? getDefaultDecisionNextStatus(currentStatus)
    );
    setDecisionReason(commercialAgreement?.decisionReason ?? '');
    setFeePercentage(commercialAgreement?.feePercentage.toString() ?? '');
    setMinimumFee(commercialAgreement?.minimumFee ?? '25.00');
    setLegalActionCapPercentage(commercialAgreement?.legalActionCapPercentage.toString() ?? '');
    setPaymentAuthorizationState(commercialAgreement?.paymentAuthorizationState ?? 'pending');
    setTermsVersion(commercialAgreement?.termsVersion ?? '');
    setRecoveredAmount(successFeeCollection?.recoveredAmount ?? '');
    setDeductionPath(successFeeCollection?.deductionAllowed ? 'allowed' : 'fallback');
  }, [commercialAgreement, currentStatus, recoveryDecision, successFeeCollection]);

  useEffect(() => {
    setSelectedAssigneeId(getSelectedAssigneeId({ assignmentOptions, assigneeId, staffId }));
  }, [assignmentOptions, assigneeId, staffId]);

  const handleAssign = () => {
    const nextAssigneeId = selectedAssigneeId || null;
    const selectedAssignmentLabel =
      assignmentOptions.find(option => option.id === nextAssigneeId)?.label ?? nextAssigneeId;
    const successDescription = getAssignmentSuccessDescription({
      nextAssigneeId,
      selectedAssignmentLabel,
      staffId,
      t,
    });

    startTransition(async () => {
      const result = await assignClaim(claimId, nextAssigneeId);
      if (result.success) {
        toast.success(t('staff_actions.success.title'), {
          description: successDescription,
        });
        router.refresh();
      } else {
        toast.error(t('staff_actions.error.title'), { description: result.error });
      }
    });
  };

  const handleAgreementSave = () => {
    startTransition(async () => {
      const idempotencyKey = agreementSaveKeyRef.current ?? crypto.randomUUID();
      agreementSaveKeyRef.current = idempotencyKey;
      try {
        const result = await saveClaimEscalationAgreement({
          claimId,
          decisionNextStatus,
          decisionReason: decisionReason.trim(),
          feePercentage: Number(feePercentage),
          idempotencyKey,
          legalActionCapPercentage: Number(legalActionCapPercentage),
          minimumFee,
          paymentAuthorizationState,
          termsVersion: termsVersion.trim(),
        });

        if (result.success) {
          toast.success(t('staff_actions.success.title'), {
            description: t('staff_actions.success.agreement_saved'),
          });
          setSavedAgreement(result.data ?? null);
          router.refresh();
        } else {
          toast.error(t('staff_actions.error.title'), { description: result.error });
        }
      } finally {
        agreementSaveKeyRef.current = null;
      }
    });
  };

  const handleAcceptRecoveryDecision = () => {
    startTransition(async () => {
      const idempotencyKey = decisionSaveKeyRef.current ?? crypto.randomUUID();
      decisionSaveKeyRef.current = idempotencyKey;
      try {
        const result = await saveRecoveryDecision({
          claimId,
          decisionType: 'accepted',
          explanation: decisionExplanation.trim() || undefined,
          idempotencyKey,
        });

        if (result.success) {
          toast.success(t('staff_actions.success.title'), {
            description: t('staff_actions.success.recovery_accepted'),
          });
          setSavedRecoveryDecision(result.data ?? recoveryDecision);
          setDeclineReasonCode('');
          router.refresh();
        } else {
          toast.error(t('staff_actions.error.title'), { description: result.error });
        }
      } finally {
        decisionSaveKeyRef.current = null;
      }
    });
  };

  const handleDeclineRecoveryDecision = () => {
    if (!declineReasonCode) {
      return;
    }

    startTransition(async () => {
      const result = await updateClaimStatus(
        claimId,
        'rejected',
        undefined,
        true,
        undefined,
        declineReasonCode,
        decisionExplanation.trim() || undefined
      );

      if (result.success) {
        toast.success(t('staff_actions.success.title'), {
          description: t('staff_actions.success.recovery_declined'),
        });
        setStatus('rejected');
        router.refresh();
      } else {
        toast.error(t('staff_actions.error.title'), { description: result.error });
      }
    });
  };

  const handleStatusUpdate = () => {
    startTransition(async () => {
      const trimmedNote = note.trim();
      const trimmedAllowanceOverrideReason = allowanceOverrideReason.trim();
      const result = await updateClaimStatus(
        claimId,
        status,
        trimmedNote || undefined,
        true,
        trimmedAllowanceOverrideReason || undefined
      );
      if (result.success) {
        toast.success(t('staff_actions.success.title'), {
          description: t('staff_actions.success.status_updated'),
        });
        setNote('');
        setAllowanceOverrideReason('');
        router.refresh();
      } else {
        toast.error(t('staff_actions.error.title'), { description: result.error });
      }
    });
  };

  const handleSuccessFeeCollectionSave = () => {
    if (!hasValidRecoveredAmount) {
      toast.error(t('staff_actions.error.title'), {
        description: t('staff_actions.validation.recovered_amount_positive'),
      });
      return;
    }

    startTransition(async () => {
      const result = await saveSuccessFeeCollection({
        claimId,
        deductionAllowed: deductionPath === 'allowed',
        recoveredAmount: parsedRecoveredAmount,
      });

      if (result.success) {
        toast.success(t('staff_actions.success.title'), {
          description: t('staff_actions.success.collection_saved'),
        });
        setSavedSuccessFeeCollection(result.data ?? null);
        router.refresh();
      } else {
        toast.error(t('staff_actions.error.title'), { description: result.error });
      }
    });
  };

  const isAssignedToMe = assigneeId === staffId;
  const hasAssignmentChanged =
    selectedAssigneeId.length > 0 && selectedAssigneeId !== (assigneeId ?? '');
  const hasStatusChanged = status !== currentStatus;
  const resolvedRecoveryDecision = savedRecoveryDecision;
  const resolvedAgreement = savedAgreement ?? commercialAgreement;
  const resolvedSuccessFeeCollection = savedSuccessFeeCollection ?? successFeeCollection;
  const resolvedCommercialScope = acceptedRecoveryPrerequisites.commercialScope;
  const resolvedAcceptedRecoveryPrerequisites: AcceptedRecoveryPrerequisitesSnapshot = {
    agreementReady: resolvedAgreement !== null,
    canMoveForward:
      resolvedCommercialScope.isEligible &&
      resolvedRecoveryDecision.status === 'accepted' &&
      resolvedAgreement !== null &&
      resolvedSuccessFeeCollection !== null,
    collectionPathReady: resolvedSuccessFeeCollection !== null,
    commercialScope: resolvedCommercialScope,
    isAcceptedRecoveryDecision:
      acceptedRecoveryPrerequisites.isAcceptedRecoveryDecision ||
      resolvedRecoveryDecision.status === 'accepted',
  };
  const hasCommercialAgreement = resolvedAgreement !== null;
  const parsedRecoveredAmount = Number(recoveredAmount.trim());
  const hasValidRecoveredAmount =
    Number.isFinite(parsedRecoveredAmount) && parsedRecoveredAmount > 0;
  const canSaveAgreement =
    resolvedCommercialScope.isEligible &&
    decisionReason.trim().length > 0 &&
    feePercentage.trim().length > 0 &&
    minimumFee.trim().length > 0 &&
    legalActionCapPercentage.trim().length > 0 &&
    termsVersion.trim().length > 0;
  const canSaveSuccessFeeCollection =
    resolvedCommercialScope.isEligible && hasCommercialAgreement && hasValidRecoveredAmount;
  const requiresMatterAllowanceGuard = RECOVERY_START_STATUSES.has(status);
  const requiresCommercialScopeRestriction =
    hasStatusChanged && RECOVERY_START_STATUSES.has(status) && !resolvedCommercialScope.isEligible;
  const requiresAcceptedRecoveryDecision =
    hasStatusChanged &&
    RECOVERY_START_STATUSES.has(status) &&
    resolvedRecoveryDecision.status !== 'accepted';
  const requiresAcceptedRecoveryAgreement =
    hasStatusChanged &&
    RECOVERY_START_STATUSES.has(status) &&
    resolvedAcceptedRecoveryPrerequisites.isAcceptedRecoveryDecision &&
    !resolvedAcceptedRecoveryPrerequisites.agreementReady;
  const requiresAcceptedRecoveryCollectionPath =
    hasStatusChanged &&
    RECOVERY_START_STATUSES.has(status) &&
    resolvedAcceptedRecoveryPrerequisites.isAcceptedRecoveryDecision &&
    !resolvedAcceptedRecoveryPrerequisites.collectionPathReady;
  const assignmentLabel = getAssignmentLabel({
    assigneeId,
    currentAssigneeLabel,
    isAssignedToMe,
    t,
  });
  const outOfScopeAssigneeOption = getOutOfScopeAssigneeOption({
    assignmentOptions,
    assigneeId,
    currentAssigneeLabel,
    t,
  });
  const renderedAssignmentOptions: ReadonlyArray<RenderedAssignmentOption> =
    outOfScopeAssigneeOption ? [outOfScopeAssigneeOption, ...assignmentOptions] : assignmentOptions;
  const renderedStatusOptions = claimStatusOptions.filter(
    option => option.value !== 'rejected' || currentStatus === 'rejected'
  );

  return (
    <div
      className="bg-white rounded-lg border shadow-sm p-6 space-y-6"
      data-testid="staff-claim-action-panel"
    >
      <h3 className="font-semibold text-lg">{t('staff_actions.title')}</h3>

      {!resolvedCommercialScope.isEligible ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"
          data-testid="staff-commercial-scope-restriction"
        >
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-slate-900">
              {t('staff_actions.commercial_scope.title')}
            </h4>
            <p className="font-medium text-slate-900">{resolvedCommercialScope.staffLabel}</p>
            <p className="text-xs text-slate-700">{resolvedCommercialScope.staffDescription}</p>
          </div>
        </div>
      ) : null}

      <div className="rounded-lg bg-muted/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium">{t('staff_actions.assignment.title')}</p>
            <p className="text-xs text-muted-foreground" data-testid="staff-assignment-current">
              {assignmentLabel}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[16rem]">
            <label htmlFor="staff-assignment-select" className="text-xs font-medium text-slate-700">
              {t('staff_actions.assignment.assign_claim')}
            </label>
            <select
              id="staff-assignment-select"
              className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
              data-testid="staff-assignment-select"
              disabled={isPending || assignmentOptions.length === 0}
              onChange={event => setSelectedAssigneeId(event.target.value)}
              value={selectedAssigneeId}
            >
              {renderedAssignmentOptions.map(option => (
                <option key={option.id} value={option.id} disabled={option.disabled}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="mt-3 flex justify-end">
          <Button
            size="sm"
            onClick={handleAssign}
            disabled={isPending || !hasAssignmentChanged}
            data-testid="staff-assign-claim-button"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('staff_actions.assignment.save')}
          </Button>
        </div>
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">{t('staff_actions.recovery_decision.title')}</h4>
          <p className="text-xs text-muted-foreground">
            {t('staff_actions.recovery_decision.description')}
          </p>
        </div>

        <div
          className="rounded-lg border bg-muted/30 p-4 text-sm"
          data-testid="staff-recovery-decision-summary"
        >
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <span className="text-muted-foreground">
                {t('staff_actions.recovery_decision.summary_status')}
              </span>
              <div className="font-medium text-slate-900">
                {resolvedRecoveryDecision.staffLabel}
              </div>
            </div>
            {resolvedRecoveryDecision.status === 'declined' && declineReasonCode ? (
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.recovery_decision.summary_decline_category')}
                </span>
                <div className="font-medium text-slate-900">
                  {recoveryDeclineReasonOptions.find(option => option.value === declineReasonCode)
                    ?.label ?? declineReasonCode}
                </div>
              </div>
            ) : null}
            {resolvedRecoveryDecision.explanation ? (
              <div className="md:col-span-2">
                <span className="text-muted-foreground">
                  {t('staff_actions.recovery_decision.summary_explanation')}
                </span>
                <div className="font-medium text-slate-900">
                  {resolvedRecoveryDecision.explanation}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="recovery-decision-explanation" className="text-sm font-medium">
            {t('staff_actions.recovery_decision.explanation_label')}{' '}
            <span className="text-xs text-muted-foreground">({t('staff_actions.staff_only')})</span>
          </label>
          <Textarea
            id="recovery-decision-explanation"
            placeholder={t('staff_actions.recovery_decision.explanation_placeholder')}
            value={decisionExplanation}
            onChange={event => setDecisionExplanation(event.target.value)}
            disabled={isPending}
            className="min-h-[80px]"
          />
        </div>

        <div className="grid gap-3 md:grid-cols-2">
          <Button
            onClick={handleAcceptRecoveryDecision}
            disabled={isPending}
            data-testid="staff-accept-recovery-decision-button"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {t('staff_actions.recovery_decision.accept')}
          </Button>

          <div className="space-y-2">
            <label htmlFor="recovery-decline-reason" className="text-sm font-medium">
              {t('staff_actions.recovery_decision.decline_category_label')}
            </label>
            <select
              id="recovery-decline-reason"
              className="h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              value={declineReasonCode}
              onChange={event => {
                const nextDeclineReasonCode = event.target.value;
                setDeclineReasonCode(
                  nextDeclineReasonCode === ''
                    ? ''
                    : (nextDeclineReasonCode as RecoveryDeclineReasonCode)
                );
              }}
              disabled={isPending}
            >
              <option value="">
                {t('staff_actions.recovery_decision.decline_category_placeholder')}
              </option>
              {recoveryDeclineReasonOptions.map(option => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <Button
          className="w-full"
          variant="outline"
          onClick={handleDeclineRecoveryDecision}
          disabled={isPending || !declineReasonCode}
          data-testid="staff-decline-recovery-decision-button"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('staff_actions.recovery_decision.decline')}
        </Button>
      </div>

      {resolvedAcceptedRecoveryPrerequisites.isAcceptedRecoveryDecision ? (
        <div
          className="rounded-lg border bg-muted/30 p-4 text-sm"
          data-testid="staff-accepted-recovery-prerequisites"
        >
          <div className="space-y-1">
            <h4 className="text-sm font-medium">
              {t('staff_actions.recovery_prerequisites.title')}
            </h4>
            <p className="text-xs text-muted-foreground">
              {t('staff_actions.recovery_prerequisites.description')}
            </p>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div>
              <span className="text-muted-foreground">
                {t('staff_actions.recovery_prerequisites.agreement')}
              </span>
              <div className="font-medium text-slate-900">
                {resolvedAcceptedRecoveryPrerequisites.agreementReady
                  ? t('staff_actions.common.ready')
                  : t('staff_actions.common.missing')}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">
                {t('staff_actions.recovery_prerequisites.collection_path')}
              </span>
              <div className="font-medium text-slate-900">
                {resolvedAcceptedRecoveryPrerequisites.collectionPathReady
                  ? t('staff_actions.common.ready')
                  : t('staff_actions.common.missing')}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 border-t pt-6">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">{t('staff_actions.escalation_agreement.title')}</h4>
          <p className="text-xs text-muted-foreground">
            {t('staff_actions.escalation_agreement.description')}
          </p>
        </div>

        <div
          className="rounded-lg border bg-muted/30 p-4 text-sm"
          data-testid="staff-escalation-agreement-summary"
        >
          {resolvedAgreement ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.escalation_agreement.accepted_next_state')}
                </span>
                <div className="font-medium text-slate-900">
                  {resolvedAgreement.decisionNextStatus
                    ? tStatus(resolvedAgreement.decisionNextStatus)
                    : t('staff_actions.common.not_recorded')}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.escalation_agreement.decision_reason')}
                </span>
                <div className="font-medium text-slate-900">
                  {resolvedAgreement.decisionReason ?? t('staff_actions.common.not_recorded')}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.escalation_agreement.fee')}
                </span>
                <div className="font-medium text-slate-900">{resolvedAgreement.feePercentage}%</div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.escalation_agreement.minimum_fee')}
                </span>
                <div className="font-medium text-slate-900">EUR {resolvedAgreement.minimumFee}</div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.escalation_agreement.legal_action_cap')}
                </span>
                <div className="font-medium text-slate-900">
                  {resolvedAgreement.legalActionCapPercentage}%
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.escalation_agreement.payment_authorization')}
                </span>
                <div className="font-medium text-slate-900">
                  {getPaymentAuthorizationLabel(resolvedAgreement.paymentAuthorizationState, t)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.escalation_agreement.terms_version')}
                </span>
                <div className="font-medium text-slate-900">{resolvedAgreement.termsVersion}</div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.escalation_agreement.signed')}
                </span>
                <div className="font-medium text-slate-900">
                  {formatUtcDateTime(resolvedAgreement.signedAt, t)}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {resolvedAcceptedRecoveryPrerequisites.isAcceptedRecoveryDecision
                ? t('staff_actions.escalation_agreement.empty_requires_save')
                : t('staff_actions.escalation_agreement.empty')}
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="agreement-fee-percentage" className="text-sm font-medium">
              {t('staff_actions.escalation_agreement.fee_percentage')}
            </label>
            <Input
              id="agreement-fee-percentage"
              type="number"
              min="1"
              step="1"
              value={feePercentage}
              onChange={event => setFeePercentage(event.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="agreement-minimum-fee" className="text-sm font-medium">
              {t('staff_actions.escalation_agreement.minimum_fee_input')}
            </label>
            <Input
              id="agreement-minimum-fee"
              type="number"
              min="0.01"
              step="0.01"
              value={minimumFee}
              onChange={event => setMinimumFee(event.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="agreement-legal-cap" className="text-sm font-medium">
              {t('staff_actions.escalation_agreement.legal_action_cap')}
            </label>
            <Input
              id="agreement-legal-cap"
              type="number"
              min="1"
              step="1"
              value={legalActionCapPercentage}
              onChange={event => setLegalActionCapPercentage(event.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="agreement-terms-version" className="text-sm font-medium">
              {t('staff_actions.escalation_agreement.terms_version')}
            </label>
            <Input
              id="agreement-terms-version"
              value={termsVersion}
              onChange={event => setTermsVersion(event.target.value)}
              disabled={isPending}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="agreement-decision-next-status" className="text-sm font-medium">
              {t('staff_actions.escalation_agreement.accepted_next_state')}
            </label>
            <Select
              value={decisionNextStatus}
              onValueChange={value => setDecisionNextStatus(value as EscalationDecisionNextStatus)}
              disabled={isPending}
            >
              <SelectTrigger id="agreement-decision-next-status">
                <SelectValue
                  placeholder={t(
                    'staff_actions.escalation_agreement.accepted_next_state_placeholder'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                {escalationDecisionStatusOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="agreement-payment-auth" className="text-sm font-medium">
              {t('staff_actions.escalation_agreement.payment_authorization')}
            </label>
            <Select
              value={paymentAuthorizationState}
              onValueChange={value =>
                setPaymentAuthorizationState(value as PaymentAuthorizationState)
              }
              disabled={isPending}
            >
              <SelectTrigger id="agreement-payment-auth">
                <SelectValue
                  placeholder={t(
                    'staff_actions.escalation_agreement.payment_authorization_placeholder'
                  )}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">
                  {t('staff_actions.escalation_agreement.payment_authorization_options.pending')}
                </SelectItem>
                <SelectItem value="authorized">
                  {t('staff_actions.escalation_agreement.payment_authorization_options.authorized')}
                </SelectItem>
                <SelectItem value="revoked">
                  {t('staff_actions.escalation_agreement.payment_authorization_options.revoked')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="agreement-decision-reason" className="text-sm font-medium">
              {t('staff_actions.escalation_agreement.decision_reason')}
            </label>
            <Textarea
              id="agreement-decision-reason"
              placeholder={t('staff_actions.escalation_agreement.decision_reason_placeholder')}
              value={decisionReason}
              onChange={event => setDecisionReason(event.target.value)}
              disabled={isPending}
              className="min-h-[80px]"
            />
          </div>
        </div>

        <Button
          className="w-full"
          onClick={handleAgreementSave}
          disabled={isPending || !canSaveAgreement}
          data-testid="staff-save-escalation-agreement-button"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('staff_actions.escalation_agreement.save')}
        </Button>
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">{t('staff_actions.success_fee.title')}</h4>
          <p className="text-xs text-muted-foreground">
            {t('staff_actions.success_fee.description')}
          </p>
        </div>

        <div
          className="rounded-lg border bg-muted/30 p-4 text-sm"
          data-testid="staff-success-fee-collection-summary"
        >
          {resolvedSuccessFeeCollection ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.success_fee.recovered_amount')}
                </span>
                <div className="font-medium text-slate-900">
                  {resolvedSuccessFeeCollection.currencyCode}{' '}
                  {resolvedSuccessFeeCollection.recoveredAmount}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.success_fee.success_fee')}
                </span>
                <div className="font-medium text-slate-900">
                  {resolvedSuccessFeeCollection.currencyCode}{' '}
                  {resolvedSuccessFeeCollection.feeAmount}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.success_fee.collection_method')}
                </span>
                <div className="font-medium text-slate-900">
                  {formatCollectionMethodLabel(resolvedSuccessFeeCollection.collectionMethod, t)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.success_fee.stored_payment_method')}
                </span>
                <div className="font-medium text-slate-900">
                  {resolvedSuccessFeeCollection.hasStoredPaymentMethod
                    ? t('staff_actions.common.yes')
                    : t('staff_actions.common.no')}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.success_fee.invoice_due')}
                </span>
                <div className="font-medium text-slate-900">
                  {resolvedSuccessFeeCollection.invoiceDueAt
                    ? formatUtcDateTime(resolvedSuccessFeeCollection.invoiceDueAt, t)
                    : '-'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">
                  {t('staff_actions.success_fee.resolved')}
                </span>
                <div className="font-medium text-slate-900">
                  {formatUtcDateTime(resolvedSuccessFeeCollection.resolvedAt, t)}
                </div>
              </div>
            </div>
          ) : hasCommercialAgreement ? (
            <p className="text-muted-foreground">
              {resolvedAcceptedRecoveryPrerequisites.isAcceptedRecoveryDecision
                ? t('staff_actions.success_fee.empty_requires_save')
                : t('staff_actions.success_fee.empty')}
            </p>
          ) : (
            <p className="text-muted-foreground">
              {t('staff_actions.success_fee.locked_without_agreement')}
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="success-fee-recovered-amount" className="text-sm font-medium">
              {t('staff_actions.success_fee.recovered_amount')}
            </label>
            <Input
              id="success-fee-recovered-amount"
              type="number"
              min="0.01"
              step="0.01"
              value={recoveredAmount}
              onChange={event => setRecoveredAmount(event.target.value)}
              disabled={isPending || !hasCommercialAgreement}
            />
          </div>
          <div className="space-y-2">
            <label htmlFor="success-fee-deduction-path" className="text-sm font-medium">
              {t('staff_actions.success_fee.deduct_from_payout')}
            </label>
            <Select
              value={deductionPath}
              onValueChange={value => setDeductionPath(value)}
              disabled={isPending || !hasCommercialAgreement}
            >
              <SelectTrigger id="success-fee-deduction-path">
                <SelectValue
                  placeholder={t('staff_actions.success_fee.collection_path_placeholder')}
                />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allowed">
                  {t('staff_actions.success_fee.deduction_path_options.allowed')}
                </SelectItem>
                <SelectItem value="fallback">
                  {t('staff_actions.success_fee.deduction_path_options.fallback')}
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <Button
          className="w-full"
          onClick={handleSuccessFeeCollectionSave}
          disabled={isPending || !canSaveSuccessFeeCollection}
          data-testid="staff-save-success-fee-collection-button"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('staff_actions.success_fee.save')}
        </Button>
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="space-y-2">
          <label htmlFor="claim-status-select" className="text-sm font-medium">
            {t('staff_actions.status_update.title')}
          </label>
          <Select
            value={status}
            onValueChange={value => setStatus(value as ClaimStatus)}
            disabled={isPending}
          >
            <SelectTrigger id="claim-status-select">
              <SelectValue placeholder={t('staff_actions.status_update.select_status')} />
            </SelectTrigger>
            <SelectContent>
              {renderedStatusOptions.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="claim-status-note" className="text-sm font-medium">
            {t('staff_actions.status_update.note_label')}{' '}
            <span className="text-xs text-muted-foreground">
              ({t('staff_actions.status_update.visible_to_member')})
            </span>
          </label>
          <Textarea
            id="claim-status-note"
            placeholder={t('staff_actions.status_update.note_placeholder')}
            value={note}
            onChange={event => setNote(event.target.value)}
            disabled={isPending}
            className="min-h-[80px]"
          />
        </div>

        {requiresAcceptedRecoveryDecision ? (
          <p className="text-xs text-muted-foreground">
            {t('staff_actions.status_update.requires_recovery_decision')}
          </p>
        ) : null}

        {requiresCommercialScopeRestriction ? (
          <p className="text-xs text-muted-foreground">
            {resolvedCommercialScope.enforcementError}
          </p>
        ) : null}

        {requiresAcceptedRecoveryAgreement ? (
          <p className="text-xs text-muted-foreground">
            {t('staff_actions.status_update.requires_escalation_agreement')}
          </p>
        ) : null}

        {requiresAcceptedRecoveryCollectionPath ? (
          <p className="text-xs text-muted-foreground">
            {t('staff_actions.status_update.requires_collection_path')}
          </p>
        ) : null}

        {requiresMatterAllowanceGuard ? (
          <div className="space-y-2">
            <label htmlFor="claim-status-allowance-override" className="text-sm font-medium">
              {t('staff_actions.status_update.allowance_override_reason')}{' '}
              <span className="text-xs text-muted-foreground">
                ({t('staff_actions.staff_only')})
              </span>
            </label>
            <p className="text-xs text-muted-foreground">
              {t('staff_actions.status_update.allowance_override_description')}
            </p>
            <Textarea
              id="claim-status-allowance-override"
              placeholder={t('staff_actions.status_update.allowance_override_placeholder')}
              value={allowanceOverrideReason}
              onChange={event => setAllowanceOverrideReason(event.target.value)}
              disabled={isPending}
              className="min-h-[80px]"
            />
          </div>
        ) : null}

        <Button
          className="w-full"
          onClick={handleStatusUpdate}
          disabled={
            isPending ||
            (!hasStatusChanged && !note.trim()) ||
            requiresCommercialScopeRestriction ||
            requiresAcceptedRecoveryDecision ||
            requiresAcceptedRecoveryAgreement ||
            requiresAcceptedRecoveryCollectionPath
          }
          data-testid="staff-update-claim-button"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('staff_actions.status_update.save')}
        </Button>
      </div>
    </div>
  );
}
