'use client';

import {
  type AcceptedRecoveryPrerequisitesSnapshot,
  type ClaimEscalationAgreementSnapshot,
  type ClaimStatus,
  type EscalationDecisionNextStatus,
  type PaymentAuthorizationState,
  type RecoveryDeclineReasonCode,
  type RecoveryDecisionSnapshot,
  type SuccessFeeCollectionSnapshot,
} from '@/actions/staff-claims.core';
import { CLAIM_STATUSES as CANONICAL_CLAIM_STATUSES } from '@interdomestik/database/constants';
import { useLocale, useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState, useTransition } from 'react';

import {
  getAssignmentLabel,
  getOutOfScopeAssigneeOption,
  getSelectedAssigneeId,
} from './assignment-helpers';
import { getDefaultDecisionNextStatus, RECOVERY_START_STATUSES } from './escalation-helpers';
import { getRecoveryDeclineReasonOptions } from './recovery-decision-helpers';
import type { ClaimActionPanelProps, ClaimStatusOption } from './types';
import { useClaimActionPanelHandlers } from './use-claim-action-panel-handlers';

export function useClaimActionPanelModel({
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
  const locale = useLocale();
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
  const claimStatusOptions: ClaimStatusOption[] = CANONICAL_CLAIM_STATUSES.map(status => ({
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

  const resolvedRecoveryDecision = savedRecoveryDecision;
  const resolvedAgreement = savedAgreement ?? commercialAgreement;
  const resolvedSuccessFeeCollection = savedSuccessFeeCollection ?? successFeeCollection;
  const resolvedCommercialScope = acceptedRecoveryPrerequisites.commercialScope;
  const parsedRecoveredAmount = Number(recoveredAmount.trim());
  const hasCommercialAgreement = resolvedAgreement !== null;
  const hasStatusChanged = status !== currentStatus;
  const hasValidRecoveredAmount =
    Number.isFinite(parsedRecoveredAmount) && parsedRecoveredAmount > 0;
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
  const isAssignedToMe = assigneeId === staffId;
  const hasAssignmentChanged =
    selectedAssigneeId.length > 0 && selectedAssigneeId !== (assigneeId ?? '');
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
  const renderedAssignmentOptions = outOfScopeAssigneeOption
    ? [outOfScopeAssigneeOption, ...assignmentOptions]
    : assignmentOptions;
  const renderedStatusOptions = claimStatusOptions.filter(
    option => option.value !== 'rejected' || currentStatus === 'rejected'
  );

  const handlers = useClaimActionPanelHandlers({
    agreementSaveKeyRef,
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
    refresh: router.refresh,
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
  });

  return {
    allowanceOverrideReason,
    assignmentLabel,
    canSaveAgreement,
    canSaveSuccessFeeCollection,
    contextValue: { claimId, isPending, startTransition, t, tStatus },
    decisionExplanation,
    decisionNextStatus,
    decisionReason,
    declineReasonCode,
    deductionPath,
    escalationDecisionStatusOptions,
    feePercentage,
    hasAssignmentChanged,
    hasCommercialAgreement,
    hasStatusChanged,
    legalActionCapPercentage,
    locale,
    minimumFee,
    note,
    paymentAuthorizationState,
    recoveredAmount,
    recoveryDeclineReasonOptions,
    renderedAssignmentOptions,
    renderedStatusOptions,
    requiresAcceptedRecoveryAgreement,
    requiresAcceptedRecoveryCollectionPath,
    requiresAcceptedRecoveryDecision,
    requiresCommercialScopeRestriction,
    requiresMatterAllowanceGuard,
    resolvedAcceptedRecoveryPrerequisites,
    resolvedAgreement,
    resolvedCommercialScope,
    resolvedRecoveryDecision,
    resolvedSuccessFeeCollection,
    selectedAssigneeId,
    status,
    termsVersion,
    handleAcceptRecoveryDecision: handlers.handleAcceptRecoveryDecision,
    handleAgreementSave: handlers.handleAgreementSave,
    handleAssign: handlers.handleAssign,
    handleDeclineRecoveryDecision: handlers.handleDeclineRecoveryDecision,
    handleStatusUpdate: handlers.handleStatusUpdate,
    handleSuccessFeeCollectionSave: handlers.handleSuccessFeeCollectionSave,
    setAllowanceOverrideReason,
    setDecisionExplanation,
    setDecisionNextStatus,
    setDecisionReason,
    setDeclineReasonCode,
    setDeductionPath,
    setFeePercentage,
    setLegalActionCapPercentage,
    setMinimumFee,
    setNote,
    setPaymentAuthorizationState,
    setRecoveredAmount,
    setSelectedAssigneeId,
    setStatus,
    setTermsVersion,
  };
}
