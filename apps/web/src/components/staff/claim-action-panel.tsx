'use client';

import {
  assignClaim,
  ClaimEscalationAgreementSnapshot,
  ClaimStatus,
  PaymentAuthorizationState,
  saveClaimEscalationAgreement,
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
import { useEffect, useState, useTransition } from 'react';
import { toast } from 'sonner';

interface ClaimActionPanelProps {
  readonly claimId: string;
  readonly commercialAgreement: ClaimEscalationAgreementSnapshot | null;
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

export function ClaimActionPanel({
  claimId,
  commercialAgreement,
  currentStatus,
  staffId,
  assigneeId,
}: ClaimActionPanelProps) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState('');
  const [status, setStatus] = useState<ClaimStatus>(currentStatus as ClaimStatus);
  const [savedAgreement, setSavedAgreement] = useState<ClaimEscalationAgreementSnapshot | null>(
    commercialAgreement
  );
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
  const router = useRouter();

  useEffect(() => {
    setSavedAgreement(commercialAgreement);
    setFeePercentage(commercialAgreement?.feePercentage.toString() ?? '');
    setMinimumFee(commercialAgreement?.minimumFee ?? '25.00');
    setLegalActionCapPercentage(commercialAgreement?.legalActionCapPercentage.toString() ?? '');
    setPaymentAuthorizationState(commercialAgreement?.paymentAuthorizationState ?? 'pending');
    setTermsVersion(commercialAgreement?.termsVersion ?? '');
  }, [commercialAgreement]);

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
      const result = await saveClaimEscalationAgreement({
        claimId,
        feePercentage: Number(feePercentage),
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
    });
  };

  const handleStatusUpdate = () => {
    startTransition(async () => {
      const result = await updateClaimStatus(claimId, status as ClaimStatus, note);
      if (result.success) {
        toast.success('Success', { description: 'Claim status updated' });
        setNote('');
        router.refresh();
      } else {
        toast.error('Error', { description: result.error });
      }
    });
  };

  const isAssignedToMe = assigneeId === staffId;
  const hasStatusChanged = status !== currentStatus;
  const canSaveAgreement =
    feePercentage.trim().length > 0 &&
    minimumFee.trim().length > 0 &&
    legalActionCapPercentage.trim().length > 0 &&
    termsVersion.trim().length > 0;

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
          <div className="space-y-2 md:col-span-2">
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
            Status Note <span className="text-xs text-muted-foreground">(Visible to member)</span>
          </label>
          <Textarea
            id="claim-status-note"
            placeholder="Reason for status change..."
            value={note}
            onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setNote(e.target.value)}
            disabled={isPending}
            className="min-h-[80px]"
          />
        </div>

        <Button
          className="w-full"
          onClick={handleStatusUpdate}
          disabled={isPending || (!hasStatusChanged && !note)}
          data-testid="staff-update-claim-button"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Update Claim
        </Button>
      </div>
    </div>
  );
}
