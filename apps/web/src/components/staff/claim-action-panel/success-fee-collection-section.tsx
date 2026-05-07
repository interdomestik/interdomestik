'use client';

import type {
  AcceptedRecoveryPrerequisitesSnapshot,
  SuccessFeeCollectionSnapshot,
} from '@/actions/staff-claims.core';
import {
  Button,
  Input,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui';
import { Loader2 } from 'lucide-react';

import { useClaimActionPanel } from './context';
import { formatCollectionMethodLabel } from './escalation-helpers';
import { formatUtcDateTime } from './format-helpers';

type SuccessFeeCollectionSectionProps = {
  canSaveSuccessFeeCollection: boolean;
  deductionPath: string;
  hasCommercialAgreement: boolean;
  recoveredAmount: string;
  resolvedAcceptedRecoveryPrerequisites: AcceptedRecoveryPrerequisitesSnapshot;
  resolvedSuccessFeeCollection: SuccessFeeCollectionSnapshot | null;
  onSuccessFeeCollectionSave: () => void;
  setDeductionPath: (value: string) => void;
  setRecoveredAmount: (value: string) => void;
};

export function SuccessFeeCollectionSection({
  canSaveSuccessFeeCollection,
  deductionPath,
  hasCommercialAgreement,
  recoveredAmount,
  resolvedAcceptedRecoveryPrerequisites,
  resolvedSuccessFeeCollection,
  onSuccessFeeCollectionSave,
  setDeductionPath,
  setRecoveredAmount,
}: SuccessFeeCollectionSectionProps) {
  const { isPending, t } = useClaimActionPanel();

  return (
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
                {resolvedSuccessFeeCollection.currencyCode} {resolvedSuccessFeeCollection.feeAmount}
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
        onClick={onSuccessFeeCollectionSave}
        disabled={isPending || !canSaveSuccessFeeCollection}
        data-testid="staff-save-success-fee-collection-button"
      >
        {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
        {t('staff_actions.success_fee.save')}
      </Button>
    </div>
  );
}
