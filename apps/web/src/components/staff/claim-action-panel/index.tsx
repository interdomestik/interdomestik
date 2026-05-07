'use client';

import { AcceptedRecoveryPrerequisitesSection } from './accepted-recovery-prerequisites-section';
import { AssignmentSection } from './assignment-section';
import { ClaimActionPanelProvider } from './context';
import { CommercialScopeRestrictionSection } from './commercial-scope-restriction-section';
import { EscalationAgreementSection } from './escalation-agreement-section';
import { RecoveryDecisionSection } from './recovery-decision-section';
import { StatusUpdateSection } from './status-update-section';
import { SuccessFeeCollectionSection } from './success-fee-collection-section';
import { useClaimActionPanelModel } from './use-claim-action-panel-model';
import type { ClaimActionPanelProps } from './types';

export function ClaimActionPanel(props: ClaimActionPanelProps) {
  const model = useClaimActionPanelModel(props);

  return (
    <ClaimActionPanelProvider value={model.contextValue}>
      <div
        className="bg-white rounded-lg border shadow-sm p-6 space-y-6"
        data-testid="staff-claim-action-panel"
      >
        <h3 className="font-semibold text-lg">{model.contextValue.t('staff_actions.title')}</h3>

        <CommercialScopeRestrictionSection commercialScope={model.resolvedCommercialScope} />

        <AssignmentSection
          assignmentLabel={model.assignmentLabel}
          renderedAssignmentOptions={model.renderedAssignmentOptions}
          selectedAssigneeId={model.selectedAssigneeId}
          setSelectedAssigneeId={model.setSelectedAssigneeId}
          hasAssignmentChanged={model.hasAssignmentChanged}
          hasAssignableOptions={props.assignmentOptions.length > 0}
          onAssign={model.handleAssign}
        />

        <RecoveryDecisionSection
          declineReasonCode={model.declineReasonCode}
          decisionExplanation={model.decisionExplanation}
          locale={model.locale}
          recoveryDeclineReasonOptions={model.recoveryDeclineReasonOptions}
          resolvedRecoveryDecision={model.resolvedRecoveryDecision}
          onAcceptRecoveryDecision={model.handleAcceptRecoveryDecision}
          onDeclineRecoveryDecision={model.handleDeclineRecoveryDecision}
          setDeclineReasonCode={model.setDeclineReasonCode}
          setDecisionExplanation={model.setDecisionExplanation}
        />

        <AcceptedRecoveryPrerequisitesSection
          prerequisites={model.resolvedAcceptedRecoveryPrerequisites}
        />

        <EscalationAgreementSection
          canSaveAgreement={model.canSaveAgreement}
          decisionNextStatus={model.decisionNextStatus}
          decisionReason={model.decisionReason}
          escalationDecisionStatusOptions={model.escalationDecisionStatusOptions}
          feePercentage={model.feePercentage}
          legalActionCapPercentage={model.legalActionCapPercentage}
          minimumFee={model.minimumFee}
          paymentAuthorizationState={model.paymentAuthorizationState}
          resolvedAcceptedRecoveryPrerequisites={model.resolvedAcceptedRecoveryPrerequisites}
          resolvedAgreement={model.resolvedAgreement}
          termsVersion={model.termsVersion}
          onAgreementSave={model.handleAgreementSave}
          setDecisionNextStatus={model.setDecisionNextStatus}
          setDecisionReason={model.setDecisionReason}
          setFeePercentage={model.setFeePercentage}
          setLegalActionCapPercentage={model.setLegalActionCapPercentage}
          setMinimumFee={model.setMinimumFee}
          setPaymentAuthorizationState={model.setPaymentAuthorizationState}
          setTermsVersion={model.setTermsVersion}
        />

        <SuccessFeeCollectionSection
          canSaveSuccessFeeCollection={model.canSaveSuccessFeeCollection}
          deductionPath={model.deductionPath}
          hasCommercialAgreement={model.hasCommercialAgreement}
          recoveredAmount={model.recoveredAmount}
          resolvedAcceptedRecoveryPrerequisites={model.resolvedAcceptedRecoveryPrerequisites}
          resolvedSuccessFeeCollection={model.resolvedSuccessFeeCollection}
          onSuccessFeeCollectionSave={model.handleSuccessFeeCollectionSave}
          setDeductionPath={model.setDeductionPath}
          setRecoveredAmount={model.setRecoveredAmount}
        />

        <StatusUpdateSection
          allowanceOverrideReason={model.allowanceOverrideReason}
          hasStatusChanged={model.hasStatusChanged}
          note={model.note}
          renderedStatusOptions={model.renderedStatusOptions}
          requiresAcceptedRecoveryAgreement={model.requiresAcceptedRecoveryAgreement}
          requiresAcceptedRecoveryCollectionPath={model.requiresAcceptedRecoveryCollectionPath}
          requiresAcceptedRecoveryDecision={model.requiresAcceptedRecoveryDecision}
          requiresCommercialScopeRestriction={model.requiresCommercialScopeRestriction}
          requiresMatterAllowanceGuard={model.requiresMatterAllowanceGuard}
          resolvedCommercialScope={model.resolvedCommercialScope}
          status={model.status}
          onStatusUpdate={model.handleStatusUpdate}
          setAllowanceOverrideReason={model.setAllowanceOverrideReason}
          setNote={model.setNote}
          setStatus={model.setStatus}
        />
      </div>
    </ClaimActionPanelProvider>
  );
}
