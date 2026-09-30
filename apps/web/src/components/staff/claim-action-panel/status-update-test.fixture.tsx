import { Component, useRef, useState, useTransition, type ReactNode } from 'react';
import type { ClaimStatus, RecoveryDecisionSnapshot } from '@/actions/staff-claims.core';
import type { TranslateFn } from './format-helpers';
import { useClaimActionPanelHandlers } from './use-claim-action-panel-handlers';

export const INITIAL_STATUS: ClaimStatus = 'verification';
export const t: TranslateFn = key => key;
export const stubRecoveryDecision: RecoveryDecisionSnapshot = {
  status: 'pending',
  decidedAt: null,
  explanation: null,
  declineReasonCode: null,
  staffLabel: 'Pending',
  memberLabel: null,
  memberDescription: null,
};

export class TestErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return <div data-testid="error-boundary-fallback">fallback</div>;
    }
    return this.props.children;
  }
}

type HarnessProps = {
  refresh: () => void;
  translate?: TranslateFn;
};

export function StatusUpdateHarness({ refresh, translate = t }: Readonly<HarnessProps>) {
  const [isPending, startTransition] = useTransition();
  const [note, setNote] = useState('  raw note  ');
  const [allowanceOverrideReason, setAllowanceOverrideReason] = useState('  raw reason  ');
  const [status, setStatus] = useState<ClaimStatus>(INITIAL_STATUS);
  const decisionSaveKeyRef = useRef<string | null>(null);
  const agreementSaveKeyRef = useRef<string | null>(null);

  const { handleStatusUpdate, statusSaveUnconfirmed, acknowledgeStatusHistory } =
    useClaimActionPanelHandlers({
      agreementSaveKeyRef,
      allowanceOverrideReason,
      assignmentOptions: [],
      claimId: 'claim-1',
      decisionExplanation: '',
      decisionNextStatus: 'negotiation',
      decisionReason: '',
      decisionSaveKeyRef,
      declineReasonCode: '',
      deductionPath: 'fallback',
      feePercentage: '',
      hasValidRecoveredAmount: false,
      legalActionCapPercentage: '',
      minimumFee: '',
      note,
      parsedRecoveredAmount: 0,
      paymentAuthorizationState: 'pending',
      recoveryDecision: stubRecoveryDecision,
      refresh,
      selectedAssigneeId: '',
      setAllowanceOverrideReason,
      setDeclineReasonCode: () => {},
      setNote,
      setSavedAgreement: () => {},
      setSavedRecoveryDecision: () => {},
      setSavedSuccessFeeCollection: () => {},
      setStatus,
      staffId: 'staff-1',
      startTransition,
      status,
      t: translate,
      termsVersion: '',
    });

  return (
    <>
      <div data-testid="pending">{isPending ? 'pending' : 'idle'}</div>
      <div data-testid="note">{note}</div>
      <div data-testid="allowance">{allowanceOverrideReason}</div>
      <div data-testid="status">{status}</div>
      <button disabled={isPending || statusSaveUnconfirmed} onClick={handleStatusUpdate}>
        save
      </button>
      {statusSaveUnconfirmed && <button onClick={acknowledgeStatusHistory}>history checked</button>}
    </>
  );
}
