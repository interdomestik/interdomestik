'use client';

import {
  assignClaim,
  ClaimEscalationAgreementSnapshot,
  ClaimStatus,
  EscalationDecisionNextStatus,
  PaymentAuthorizationState,
  saveClaimEscalationAgreement,
  saveSuccessFeeCollection,
  SuccessFeeCollectionSnapshot,
  updateClaimStatus,
} from '@/actions/staff-claims';
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
  readonly claimId: string;
  readonly commercialAgreement: ClaimEscalationAgreementSnapshot | null;
  readonly successFeeCollection: SuccessFeeCollectionSnapshot | null;
  readonly currentStatus: string;
  readonly staffId: string;
  readonly assigneeId: string | null;
}

const CLAIM_STATUS_OPTIONS: { value: ClaimStatus; label: string }[] = CANONICAL_CLAIM_STATUSES.map(
  status => ({
    value: status as ClaimStatus,
    label: getStaffClaimStatusLabel(status),
  })
);
const RECOVERY_START_STATUSES: ReadonlySet<ClaimStatus> = new Set(['negotiation', 'court']);
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

export function ClaimActionPanel({
  claimId,
  commercialAgreement,
  successFeeCollection,
  currentStatus,
  staffId,
  assigneeId,
}: ClaimActionPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [allowanceOverrideReason, setAllowanceOverrideReason] = useState('');
  const agreementSaveKeyRef = useRef<string | null>(null);
  const [status, setStatus] = useState<ClaimStatus>(currentStatus as ClaimStatus);
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
  const router = useRouter();

  useEffect(() => {
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
  }, [commercialAgreement, currentStatus, successFeeCollection]);

  const handleAssign = () => {
    startTransition(async () => {
      const result = await assignClaim(claimId);
      if (result.success) {
        toast.success('Success', { description: 'Claim assigned to you' });
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
  const hasStatusChanged = status !== currentStatus;
  const hasCommercialAgreement = (savedAgreement ?? commercialAgreement) !== null;
  const parsedRecoveredAmount = Number(recoveredAmount.trim());
  const hasValidRecoveredAmount =
    Number.isFinite(parsedRecoveredAmount) && parsedRecoveredAmount > 0;
  const canSaveAgreement =
    decisionReason.trim().length > 0 &&
    feePercentage.trim().length > 0 &&
    minimumFee.trim().length > 0 &&
    legalActionCapPercentage.trim().length > 0 &&
    termsVersion.trim().length > 0;
  const canSaveSuccessFeeCollection = hasCommercialAgreement && hasValidRecoveredAmount;
  const requiresMatterAllowanceGuard = RECOVERY_START_STATUSES.has(status);
  const requiresDeclineReason = status === 'rejected' && currentStatus !== 'rejected';

  let assignmentLabel = 'Unassigned';
  if (assigneeId) {
    assignmentLabel = isAssignedToMe ? 'Assigned to you' : 'Assigned to colleague';
  }

  return (
    <div
      className="bg-white rounded-lg border shadow-sm p-6 space-y-6"
      data-testid="staff-claim-action-panel"
    >
      <h3 className="font-semibold text-lg">Staff Actions</h3>

      {/* Assignment Section */}
      <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
        <div>
          <p className="text-sm font-medium">Assignment</p>
          <p className="text-xs text-muted-foreground">{assignmentLabel}</p>
        </div>
        {!isAssignedToMe && (
          <Button
            size="sm"
            onClick={handleAssign}
            disabled={isPending}
            data-testid="staff-assign-claim-button"
          >
            {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {assigneeId ? 'Reassign to Me' : 'Assign to Me'}
          </Button>
        )}
        {isAssignedToMe && (
          <Button size="sm" variant="outline" disabled>
            Assigned
          </Button>
        )}
      </div>

      <div className="space-y-4 border-t pt-6">
        <div className="space-y-1">
          <h4 className="text-sm font-medium">Escalation Agreement</h4>
          <p className="text-xs text-muted-foreground">
            Staff-led recovery stays blocked until signed commercial terms and authorized payment
            collection are captured here.
          </p>
        </div>

        <div
          className="rounded-lg border bg-muted/30 p-4 text-sm"
          data-testid="staff-escalation-agreement-summary"
        >
          {savedAgreement ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Accepted next state</span>
                <div className="font-medium text-slate-900">
                  {savedAgreement.decisionNextStatus
                    ? getStaffClaimStatusLabel(savedAgreement.decisionNextStatus)
                    : 'Not recorded'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Decision reason</span>
                <div className="font-medium text-slate-900">
                  {savedAgreement.decisionReason ?? 'Not recorded'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Fee</span>
                <div className="font-medium text-slate-900">{savedAgreement.feePercentage}%</div>
              </div>
              <div>
                <span className="text-muted-foreground">Minimum fee</span>
                <div className="font-medium text-slate-900">EUR {savedAgreement.minimumFee}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Legal-action cap</span>
                <div className="font-medium text-slate-900">
                  {savedAgreement.legalActionCapPercentage}%
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Payment authorization</span>
                <div className="font-medium text-slate-900">
                  {savedAgreement.paymentAuthorizationState}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Terms version</span>
                <div className="font-medium text-slate-900">{savedAgreement.termsVersion}</div>
              </div>
              <div>
                <span className="text-muted-foreground">Signed</span>
                <div className="font-medium text-slate-900">
                  {savedAgreement.signedAt
                    ? new Date(savedAgreement.signedAt).toLocaleString()
                    : 'Pending'}
                </div>
              </div>
            </div>
          ) : (
            <p className="text-muted-foreground">No escalation agreement saved for this claim.</p>
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
          {savedSuccessFeeCollection ? (
            <div className="grid gap-2 md:grid-cols-2">
              <div>
                <span className="text-muted-foreground">Recovered amount</span>
                <div className="font-medium text-slate-900">
                  {savedSuccessFeeCollection.currencyCode}{' '}
                  {savedSuccessFeeCollection.recoveredAmount}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Success fee</span>
                <div className="font-medium text-slate-900">
                  {savedSuccessFeeCollection.currencyCode} {savedSuccessFeeCollection.feeAmount}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Collection method</span>
                <div className="font-medium text-slate-900">
                  {formatCollectionMethodLabel(savedSuccessFeeCollection.collectionMethod)}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Stored payment method</span>
                <div className="font-medium text-slate-900">
                  {savedSuccessFeeCollection.hasStoredPaymentMethod ? 'Yes' : 'No'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Invoice due</span>
                <div className="font-medium text-slate-900">
                  {savedSuccessFeeCollection.invoiceDueAt
                    ? new Date(savedSuccessFeeCollection.invoiceDueAt).toLocaleString()
                    : '-'}
                </div>
              </div>
              <div>
                <span className="text-muted-foreground">Resolved</span>
                <div className="font-medium text-slate-900">
                  {savedSuccessFeeCollection.resolvedAt
                    ? new Date(savedSuccessFeeCollection.resolvedAt).toLocaleString()
                    : 'Pending'}
                </div>
              </div>
            </div>
          ) : hasCommercialAgreement ? (
            <p className="text-muted-foreground">
              No success-fee collection order has been recorded for this claim.
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
              {CLAIM_STATUS_OPTIONS.map(s => (
                <SelectItem key={s.value} value={s.value}>
                  {s.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <label htmlFor="claim-status-note" className="text-sm font-medium">
            {requiresDeclineReason ? 'Decline reason' : 'Status Note'}{' '}
            <span className="text-xs text-muted-foreground">(Visible to member)</span>
          </label>
          <Textarea
            id="claim-status-note"
            placeholder={
              requiresDeclineReason
                ? 'Explain why staff declined this recovery matter...'
                : 'Reason for status change...'
            }
            value={note}
            onChange={event => setNote(event.target.value)}
            disabled={isPending}
            className="min-h-[80px]"
          />
        </div>

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
            (requiresDeclineReason && !note.trim())
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
