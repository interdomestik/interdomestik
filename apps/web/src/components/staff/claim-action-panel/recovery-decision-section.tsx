'use client';

import type {
  RecoveryDecisionSnapshot,
  RecoveryDeclineReasonCode,
} from '@/actions/staff-claims.core';
import { Button, Textarea } from '@interdomestik/ui';
import { Loader2 } from 'lucide-react';

import { useClaimActionPanel } from './context';
import { getRecoveryDecisionLabel } from './recovery-decision-helpers';

type RecoveryDeclineReasonOption = {
  value: RecoveryDeclineReasonCode;
  label: string;
};

type RecoveryDecisionSectionProps = {
  declineReasonCode: RecoveryDeclineReasonCode | '';
  decisionExplanation: string;
  locale: string;
  recoveryDeclineReasonOptions: ReadonlyArray<RecoveryDeclineReasonOption>;
  resolvedRecoveryDecision: RecoveryDecisionSnapshot;
  onAcceptRecoveryDecision: () => void;
  onDeclineRecoveryDecision: () => void;
  setDeclineReasonCode: (value: RecoveryDeclineReasonCode | '') => void;
  setDecisionExplanation: (value: string) => void;
};

export function RecoveryDecisionSection({
  declineReasonCode,
  decisionExplanation,
  locale,
  recoveryDeclineReasonOptions,
  resolvedRecoveryDecision,
  onAcceptRecoveryDecision,
  onDeclineRecoveryDecision,
  setDeclineReasonCode,
  setDecisionExplanation,
}: RecoveryDecisionSectionProps) {
  const { isPending, t } = useClaimActionPanel();

  return (
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
              {getRecoveryDecisionLabel(resolvedRecoveryDecision, locale)}
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
          onClick={onAcceptRecoveryDecision}
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
        onClick={onDeclineRecoveryDecision}
        disabled={isPending || !declineReasonCode}
        data-testid="staff-decline-recovery-decision-button"
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t('staff_actions.recovery_decision.decline')}
      </Button>
    </div>
  );
}
