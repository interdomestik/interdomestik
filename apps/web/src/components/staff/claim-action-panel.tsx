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
import { getStaffClaimStatusLabel } from '@/lib/claim-ui';
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

const CLAIM_STATUS_OPTIONS: { value: ClaimStatus; label: string }[] = CANONICAL_CLAIM_STATUSES.map(
  status => ({
    value: status as ClaimStatus,
    label: getStaffClaimStatusLabel(status),
  })
);
const RECOVERY_START_STATUSES: ReadonlySet<ClaimStatus> = new Set(['negotiation', 'court']);
const RECOVERY_DECLINE_REASON_OPTIONS: Array<{
  value: RecoveryDeclineReasonCode;
  label: string;
}> = [
  { value: 'guidance_only_scope', label: 'Guidance-only or referral-only under current scope' },
  { value: 'insufficient_evidence', label: 'Insufficient evidence for staff-led recovery' },
  { value: 'no_monetary_recovery_path', label: 'No clear monetary recovery path' },
  {
    value: 'counterparty_unidentified',
    label: 'Counterparty or insurer cannot be identified',
  },
  { value: 'time_limit_risk', label: 'Time-limit risk blocks staff-led recovery' },
  { value: 'conflict_or_integrity_concern', label: 'Conflict of interest or integrity concern' },
];
const ESCALATION_DECISION_STATUS_OPTIONS: {
  value: EscalationDecisionNextStatus;
  label: string;
}[] = [
  { value: 'negotiation', label: getStaffClaimStatusLabel('negotiation') },
  { value: 'court', label: getStaffClaimStatusLabel('court') },
];

function getDefaultDecisionNextStatus(currentStatus: string): EscalationDecisionNextStatus {
  return currentStatus === 'court' ? 'court' : 'negotiation';
}

function formatCollectionMethodLabel(method: SuccessFeeCollectionSnapshot['collectionMethod']) {
  switch (method) {
    case 'deduction':
      return 'Deduct from payout';
    case 'payment_method_charge':
      return 'Charge stored payment method';
    case 'invoice':
      return 'Invoice fallback';
    default:
      return method;
  }
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

function formatUtcDateTime(value: string | null | undefined) {
  if (!value) return 'Pending';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Pending';
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
}): RenderedAssignmentOption | null {
  if (args.assigneeId === null || hasAssignmentOption(args.assignmentOptions, args.assigneeId)) {
    return null;
  }

  return {
    id: args.assigneeId,
    label: `${args.currentAssigneeLabel ?? 'Current assignee'} (out of scope)`,
    disabled: true,
  };
}

function getAssignmentSuccessDescription(args: {
  nextAssigneeId: string | null;
  selectedAssignmentLabel: string | null;
  staffId: string;
}) {
  if (args.nextAssigneeId === args.staffId) {
    return 'Claim assigned to you';
  }

  if (args.selectedAssignmentLabel) {
    return `Claim assigned to ${args.selectedAssignmentLabel}`;
  }

  return 'Claim assignment updated';
}

function getAssignmentLabel(args: {
  assigneeId: string | null;
  currentAssigneeLabel?: string | null;
  isAssignedToMe: boolean;
}) {
  if (args.assigneeId === null) {
    return 'Unassigned';
  }

  if (args.isAssignedToMe) {
    return 'Assigned to you';
  }

  if (args.currentAssigneeLabel) {
    return `Assigned to ${args.currentAssigneeLabel}`;
  }

  return 'Assigned to colleague';
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
    });

    startTransition(async () => {
      const result = await assignClaim(claimId, nextAssigneeId);
      if (result.success) {
        toast.success('Success', {
          description: successDescription,
        });
        router.refresh();
      } else {
        toast.error('Error', { description: result.error });
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
          toast.success('Success', { description: 'Escalation agreement saved' });
          setSavedAgreement(result.data ?? null);
          router.refresh();
        } else {
          toast.error('Error', { description: result.error });
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
          toast.success('Success', { description: 'Recovery matter accepted' });
          setSavedRecoveryDecision(result.data ?? recoveryDecision);
          setDeclineReasonCode('');
          router.refresh();
        } else {
          toast.error('Error', { description: result.error });
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
        toast.success('Success', { description: 'Recovery matter declined' });
        setStatus('rejected');
        router.refresh();
      } else {
        toast.error('Error', { description: result.error });
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
        toast.success('Success', { description: 'Claim status updated' });
        setNote('');
        setAllowanceOverrideReason('');
        router.refresh();
      } else {
        toast.error('Error', { description: result.error });
      }
    });
  };

  const handleSuccessFeeCollectionSave = () => {
    if (!hasValidRecoveredAmount) {
      toast.error('Error', {
        description: 'Recovered amount must be a positive number.',
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
        toast.success('Success', { description: 'Success-fee collection saved' });
        setSavedSuccessFeeCollection(result.data ?? null);
        router.refresh();
      } else {
        toast.error('Error', { description: result.error });
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
  });
  const outOfScopeAssigneeOption = getOutOfScopeAssigneeOption({
    assignmentOptions,
    assigneeId,
    currentAssigneeLabel,
  });
  const renderedAssignmentOptions: ReadonlyArray<RenderedAssignmentOption> =
    outOfScopeAssigneeOption ? [outOfScopeAssigneeOption, ...assignmentOptions] : assignmentOptions;
  const renderedStatusOptions = CLAIM_STATUS_OPTIONS.filter(
    option => option.value !== 'rejected' || currentStatus === 'rejected'
  );

  return (
    <div
      className="bg-white rounded-lg border shadow-sm p-6 space-y-6"
      data-testid="staff-claim-action-panel"
    >
      <h3 className="font-semibold text-lg">Staff Actions</h3>

      {!resolvedCommercialScope.isEligible ? (
        <div
          className="rounded-lg border border-amber-300 bg-amber-50 p-4 text-sm"
          data-testid="staff-commercial-scope-restriction"
        >
          <div className="space-y-1">
            <h4 className="text-sm font-medium text-slate-900">Launch scope restriction</h4>
            <p className="font-medium text-slate-900">{resolvedCommercialScope.staffLabel}</p>
            <p className="text-xs text-slate-700">{resolvedCommercialScope.staffDescription}</p>
          </div>
        </div>
      ) : null}

      {/* Assignment Section */}
      <div className="rounded-lg bg-muted/30 p-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <p className="text-sm font-medium">Assignment</p>
            <p className="text-xs text-muted-foreground" data-testid="staff-assignment-current">
              {assignmentLabel}
            </p>
          </div>
          <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[16rem]">
            <label htmlFor="staff-assignment-select" className="text-xs font-medium text-slate-700">
              Assign claim
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
            Save Assignment
          </Button>
        </div>
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Recovery Decision</h4>
          <p className="text-xs text-muted-foreground">
            Staff must explicitly accept or decline the recovery matter before negotiation or court
            work can start.
          </p>
        </div>

        <div
          className="rounded-lg border bg-muted/30 p-4 text-sm"
          data-testid="staff-recovery-decision-summary"
        >
          <div className="grid gap-2 md:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Decision status</span>
              <div className="font-medium text-slate-900">
                {resolvedRecoveryDecision.staffLabel}
              </div>
            </div>
            {resolvedRecoveryDecision.status === 'declined' && declineReasonCode ? (
              <div>
                <span className="text-muted-foreground">Decline category</span>
                <div className="font-medium text-slate-900">
                  {RECOVERY_DECLINE_REASON_OPTIONS.find(
                    option => option.value === declineReasonCode
                  )?.label ?? declineReasonCode}
                </div>
              </div>
            ) : null}
            {resolvedRecoveryDecision.explanation ? (
              <div className="md:col-span-2">
                <span className="text-muted-foreground">Decision explanation</span>
                <div className="font-medium text-slate-900">
                  {resolvedRecoveryDecision.explanation}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        <div className="space-y-2">
          <label htmlFor="recovery-decision-explanation" className="text-sm font-medium">
            Decision explanation <span className="text-xs text-muted-foreground">(Staff only)</span>
          </label>
          <Textarea
            id="recovery-decision-explanation"
            placeholder="Record the staff-only reasoning behind the acceptance or decline decision..."
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
            Accept Recovery Matter
          </Button>

          <div className="space-y-2">
            <label htmlFor="recovery-decline-reason" className="text-sm font-medium">
              Decline category
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
              <option value="">Select decline category</option>
              {RECOVERY_DECLINE_REASON_OPTIONS.map(option => (
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
          Decline Recovery Matter
        </Button>
      </div>

      {resolvedAcceptedRecoveryPrerequisites.isAcceptedRecoveryDecision ? (
        <div
          className="rounded-lg border bg-muted/30 p-4 text-sm"
          data-testid="staff-accepted-recovery-prerequisites"
        >
          <div className="space-y-1">
            <h4 className="text-sm font-medium">Accepted recovery prerequisites</h4>
            <p className="text-xs text-muted-foreground">
              Accepted recovery cannot move into negotiation or court until both prerequisites are
              ready.
            </p>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            <div>
              <span className="text-muted-foreground">Agreement</span>
              <div className="font-medium text-slate-900">
                {resolvedAcceptedRecoveryPrerequisites.agreementReady ? 'Ready' : 'Missing'}
              </div>
            </div>
            <div>
              <span className="text-muted-foreground">Collection path</span>
              <div className="font-medium text-slate-900">
                {resolvedAcceptedRecoveryPrerequisites.collectionPathReady ? 'Ready' : 'Missing'}
              </div>
            </div>
          </div>
        </div>
      ) : null}

      <div className="space-y-4 border-t pt-6">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Escalation Agreement</h4>
          <p className="text-xs text-muted-foreground">
            Record commercial terms here after the recovery decision is accepted. This agreement
            detail does not replace the explicit recovery decision above.
          </p>
        </div>

        <div
          className="rounded-lg border bg-muted/30 p-4 text-sm"
          data-testid="staff-escalation-agreement-summary"
        >
          {resolvedAgreement ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Accepted next state</span>
                <div className="font-medium text-slate-900">
                  {resolvedAgreement.decisionNextStatus
                    ? getStaffClaimStatusLabel(resolvedAgreement.decisionNextStatus)
                    : 'Not recorded'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Decision reason</span>
                <div className="font-medium text-slate-900">
                  {resolvedAgreement.decisionReason ?? 'Not recorded'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Fee</span>
                <div className="font-medium text-slate-900">{resolvedAgreement.feePercentage}%</div>
              </div>
              <div>
                <span className="text-muted-foreground">Minimum fee</span>
                <div className="font-medium text-slate-900">EUR {resolvedAgreement.minimumFee}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Legal-action cap</span>
                <div className="font-medium text-slate-900">
                  {resolvedAgreement.legalActionCapPercentage}%
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Payment authorization</span>
                <div className="font-medium text-slate-900">
                  {resolvedAgreement.paymentAuthorizationState}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Terms version</span>
                <div className="font-medium text-slate-900">{resolvedAgreement.termsVersion}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Signed</span>
                <div className="font-medium text-slate-900">
                  {formatUtcDateTime(resolvedAgreement.signedAt)}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">
              {resolvedAcceptedRecoveryPrerequisites.isAcceptedRecoveryDecision
                ? 'Save the accepted escalation agreement before moving this case into negotiation or court.'
                : 'No escalation agreement saved for this claim.'}
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="agreement-fee-percentage" className="text-sm font-medium">
              Fee percentage
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
              Minimum fee (EUR)
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
              Legal-action cap
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
              Terms version
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
              Accepted next state
            </label>
            <Select
              value={decisionNextStatus}
              onValueChange={value => setDecisionNextStatus(value as EscalationDecisionNextStatus)}
              disabled={isPending}
            >
              <SelectTrigger id="agreement-decision-next-status">
                <SelectValue placeholder="Select accepted next state" />
              </SelectTrigger>
              <SelectContent>
                {ESCALATION_DECISION_STATUS_OPTIONS.map(option => (
                  <SelectItem key={option.value} value={option.value}>
                    {option.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <label htmlFor="agreement-payment-auth" className="text-sm font-medium">
              Payment authorization
            </label>
            <Select
              value={paymentAuthorizationState}
              onValueChange={value =>
                setPaymentAuthorizationState(value as PaymentAuthorizationState)
              }
              disabled={isPending}
            >
              <SelectTrigger id="agreement-payment-auth">
                <SelectValue placeholder="Select authorization state" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="authorized">Authorized</SelectItem>
                <SelectItem value="revoked">Revoked</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2 md:col-span-2">
            <label htmlFor="agreement-decision-reason" className="text-sm font-medium">
              Decision reason
            </label>
            <Textarea
              id="agreement-decision-reason"
              placeholder="Record why staff accepted this escalation path..."
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
          Save Escalation Agreement
        </Button>
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Success-Fee Collection</h4>
          <p className="text-xs text-muted-foreground">
            Record the recovered amount and let the commercial rules resolve deduction first where
            allowed, then stored payment method, then invoice due within 7 days.
          </p>
        </div>

        <div
          className="rounded-lg border bg-muted/30 p-4 text-sm"
          data-testid="staff-success-fee-collection-summary"
        >
          {resolvedSuccessFeeCollection ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Recovered amount</span>
                <div className="font-medium text-slate-900">
                  {resolvedSuccessFeeCollection.currencyCode}{' '}
                  {resolvedSuccessFeeCollection.recoveredAmount}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Success fee</span>
                <div className="font-medium text-slate-900">
                  {resolvedSuccessFeeCollection.currencyCode}{' '}
                  {resolvedSuccessFeeCollection.feeAmount}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Collection method</span>
                <div className="font-medium text-slate-900">
                  {formatCollectionMethodLabel(resolvedSuccessFeeCollection.collectionMethod)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Stored payment method</span>
                <div className="font-medium text-slate-900">
                  {resolvedSuccessFeeCollection.hasStoredPaymentMethod ? 'Yes' : 'No'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Invoice due</span>
                <div className="font-medium text-slate-900">
                  {resolvedSuccessFeeCollection.invoiceDueAt
                    ? formatUtcDateTime(resolvedSuccessFeeCollection.invoiceDueAt)
                    : '-'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Resolved</span>
                <div className="font-medium text-slate-900">
                  {formatUtcDateTime(resolvedSuccessFeeCollection.resolvedAt)}
                </div>
              </div>
            </div>
          ) : hasCommercialAgreement ? (
            <p className="text-muted-foreground">
              {resolvedAcceptedRecoveryPrerequisites.isAcceptedRecoveryDecision
                ? 'No success-fee collection path is recorded yet. Save one before moving this accepted case into negotiation or court.'
                : 'No success-fee collection order has been recorded for this claim.'}
            </p>
          ) : (
            <p className="text-muted-foreground">
              Save the escalation agreement first to unlock success-fee collection.
            </p>
          )}
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-2">
            <label htmlFor="success-fee-recovered-amount" className="text-sm font-medium">
              Recovered amount
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
              Deduct from payout?
            </label>
            <Select
              value={deductionPath}
              onValueChange={value => setDeductionPath(value)}
              disabled={isPending || !hasCommercialAgreement}
            >
              <SelectTrigger id="success-fee-deduction-path">
                <SelectValue placeholder="Select collection path" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="allowed">Yes, deduction is legally allowed</SelectItem>
                <SelectItem value="fallback">No, use fallback order</SelectItem>
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
          Save Success-Fee Collection
        </Button>
      </div>

      {/* Status Update Section */}
      <div className="space-y-4 border-t pt-6">
        <div className="space-y-2">
          <label htmlFor="claim-status-select" className="text-sm font-medium">
            Update Status
          </label>
          <Select
            value={status}
            onValueChange={value => setStatus(value as ClaimStatus)}
            disabled={isPending}
          >
            <SelectTrigger id="claim-status-select">
              <SelectValue placeholder="Select status" />
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
            Status Note <span className="text-xs text-muted-foreground">(Visible to member)</span>
          </label>
          <Textarea
            id="claim-status-note"
            placeholder="Reason for status change..."
            value={note}
            onChange={event => setNote(event.target.value)}
            disabled={isPending}
            className="min-h-[80px]"
          />
        </div>

        {requiresAcceptedRecoveryDecision ? (
          <p className="text-xs text-muted-foreground">
            Accept the recovery matter above before moving the case into negotiation or court.
          </p>
        ) : null}

        {requiresCommercialScopeRestriction ? (
          <p className="text-xs text-muted-foreground">
            {resolvedCommercialScope.enforcementError}
          </p>
        ) : null}

        {requiresAcceptedRecoveryAgreement ? (
          <p className="text-xs text-muted-foreground">
            Save the accepted escalation agreement before moving this case into negotiation or
            court.
          </p>
        ) : null}

        {requiresAcceptedRecoveryCollectionPath ? (
          <p className="text-xs text-muted-foreground">
            Save the success-fee collection path before moving this accepted case into negotiation
            or court.
          </p>
        ) : null}

        {requiresMatterAllowanceGuard ? (
          <div className="space-y-2">
            <label htmlFor="claim-status-allowance-override" className="text-sm font-medium">
              Allowance override reason{' '}
              <span className="text-xs text-muted-foreground">(Staff only)</span>
            </label>
            <p className="text-xs text-muted-foreground">
              If the member has exhausted annual matter allowance, record the internal override
              reason here or upgrade coverage before staff-led recovery begins.
            </p>
            <Textarea
              id="claim-status-allowance-override"
              placeholder="Explain why recovery should begin despite exhausted allowance..."
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
          Update Claim
        </Button>
      </div>
    </div>
  );
}
