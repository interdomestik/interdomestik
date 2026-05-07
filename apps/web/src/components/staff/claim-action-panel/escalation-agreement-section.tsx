'use client';

import type {
  AcceptedRecoveryPrerequisitesSnapshot,
  ClaimEscalationAgreementSnapshot,
  EscalationDecisionNextStatus,
  PaymentAuthorizationState,
} from '@/actions/staff-claims.core';
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

import { useClaimActionPanel } from './context';
import { formatUtcDateTime } from './format-helpers';
import { getPaymentAuthorizationLabel } from './escalation-helpers';

type EscalationDecisionStatusOption = {
  value: EscalationDecisionNextStatus;
  label: string;
};

type EscalationAgreementSectionProps = {
  canSaveAgreement: boolean;
  decisionNextStatus: EscalationDecisionNextStatus;
  decisionReason: string;
  escalationDecisionStatusOptions: ReadonlyArray<EscalationDecisionStatusOption>;
  feePercentage: string;
  legalActionCapPercentage: string;
  minimumFee: string;
  paymentAuthorizationState: PaymentAuthorizationState;
  resolvedAcceptedRecoveryPrerequisites: AcceptedRecoveryPrerequisitesSnapshot;
  resolvedAgreement: ClaimEscalationAgreementSnapshot | null;
  termsVersion: string;
  onAgreementSave: () => void;
  setDecisionNextStatus: (value: EscalationDecisionNextStatus) => void;
  setDecisionReason: (value: string) => void;
  setFeePercentage: (value: string) => void;
  setLegalActionCapPercentage: (value: string) => void;
  setMinimumFee: (value: string) => void;
  setPaymentAuthorizationState: (value: PaymentAuthorizationState) => void;
  setTermsVersion: (value: string) => void;
};

export function EscalationAgreementSection({
  canSaveAgreement,
  decisionNextStatus,
  decisionReason,
  escalationDecisionStatusOptions,
  feePercentage,
  legalActionCapPercentage,
  minimumFee,
  paymentAuthorizationState,
  resolvedAcceptedRecoveryPrerequisites,
  resolvedAgreement,
  termsVersion,
  onAgreementSave,
  setDecisionNextStatus,
  setDecisionReason,
  setFeePercentage,
  setLegalActionCapPercentage,
  setMinimumFee,
  setPaymentAuthorizationState,
  setTermsVersion,
}: EscalationAgreementSectionProps) {
  const { isPending, t, tStatus } = useClaimActionPanel();

  return (
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
        onClick={onAgreementSave}
        disabled={isPending || !canSaveAgreement}
        data-testid="staff-save-escalation-agreement-button"
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t('staff_actions.escalation_agreement.save')}
      </Button>
    </div>
  );
}
