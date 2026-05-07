'use client';

import {
  assignClaim,
  type ClaimEscalationAgreementSnapshot,
  type ClaimStatus,
  type EscalationDecisionNextStatus,
  type PaymentAuthorizationState,
  type RecoveryDeclineReasonCode,
  type RecoveryDecisionSnapshot,
  saveClaimEscalationAgreement,
  saveRecoveryDecision,
  saveSuccessFeeCollection,
  type SuccessFeeCollectionSnapshot,
  updateClaimStatus,
} from '@/actions/staff-claims.core';
import type { MutableRefObject } from 'react';
import { toast } from 'sonner';

import { getAssignmentSuccessDescription, type AssignmentOption } from './assignment-helpers';
import type { TranslateFn } from './format-helpers';

type UseClaimActionPanelHandlersParams = {
  allowanceOverrideReason: string;
  assignmentOptions: ReadonlyArray<AssignmentOption>;
  claimId: string;
  decisionExplanation: string;
  decisionNextStatus: EscalationDecisionNextStatus;
  decisionReason: string;
  decisionSaveKeyRef: MutableRefObject<string | null>;
  declineReasonCode: RecoveryDeclineReasonCode | '';
  deductionPath: string;
  feePercentage: string;
  hasValidRecoveredAmount: boolean;
  legalActionCapPercentage: string;
  minimumFee: string;
  note: string;
  parsedRecoveredAmount: number;
  paymentAuthorizationState: PaymentAuthorizationState;
  recoveryDecision: RecoveryDecisionSnapshot;
  refresh: () => void;
  selectedAssigneeId: string;
  setAllowanceOverrideReason: (value: string) => void;
  setDeclineReasonCode: (value: RecoveryDeclineReasonCode | '') => void;
  setNote: (value: string) => void;
  setSavedAgreement: (value: ClaimEscalationAgreementSnapshot | null) => void;
  setSavedRecoveryDecision: (value: RecoveryDecisionSnapshot) => void;
  setSavedSuccessFeeCollection: (value: SuccessFeeCollectionSnapshot | null) => void;
  setStatus: (value: ClaimStatus) => void;
  staffId: string;
  startTransition: (callback: () => void) => void;
  status: ClaimStatus;
  t: TranslateFn;
  termsVersion: string;
  agreementSaveKeyRef: MutableRefObject<string | null>;
};

export function useClaimActionPanelHandlers({
  allowanceOverrideReason,
  assignmentOptions,
  claimId,
  decisionExplanation,
  decisionNextStatus,
  decisionReason,
  decisionSaveKeyRef,
  declineReasonCode,
  deductionPath,
  feePercentage,
  hasValidRecoveredAmount,
  legalActionCapPercentage,
  minimumFee,
  note,
  parsedRecoveredAmount,
  paymentAuthorizationState,
  recoveryDecision,
  refresh,
  selectedAssigneeId,
  setAllowanceOverrideReason,
  setDeclineReasonCode,
  setNote,
  setSavedAgreement,
  setSavedRecoveryDecision,
  setSavedSuccessFeeCollection,
  setStatus,
  staffId,
  startTransition,
  status,
  t,
  termsVersion,
  agreementSaveKeyRef,
}: UseClaimActionPanelHandlersParams) {
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
        refresh();
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
          refresh();
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
          refresh();
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
        refresh();
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
        refresh();
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
        refresh();
      } else {
        toast.error(t('staff_actions.error.title'), { description: result.error });
      }
    });
  };

  return {
    handleAcceptRecoveryDecision,
    handleAgreementSave,
    handleAssign,
    handleDeclineRecoveryDecision,
    handleStatusUpdate,
    handleSuccessFeeCollectionSave,
  };
}
