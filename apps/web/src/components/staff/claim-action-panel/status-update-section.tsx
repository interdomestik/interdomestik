'use client';

import type {
  AcceptedRecoveryPrerequisitesSnapshot,
  ClaimStatus,
} from '@/actions/staff-claims.core';
import {
  Button,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Textarea,
} from '@interdomestik/ui';
import { Loader2 } from 'lucide-react';

import { useClaimActionPanel } from './context';
import type { ClaimStatusOption } from './types';

type StatusUpdateSectionProps = {
  allowanceOverrideReason: string;
  hasStatusChanged: boolean;
  note: string;
  renderedStatusOptions: ReadonlyArray<ClaimStatusOption>;
  requiresAcceptedRecoveryAgreement: boolean;
  requiresAcceptedRecoveryCollectionPath: boolean;
  requiresAcceptedRecoveryDecision: boolean;
  requiresCommercialScopeRestriction: boolean;
  requiresMatterAllowanceGuard: boolean;
  resolvedCommercialScope: AcceptedRecoveryPrerequisitesSnapshot['commercialScope'];
  status: ClaimStatus;
  onStatusUpdate: () => void;
  setAllowanceOverrideReason: (value: string) => void;
  setNote: (value: string) => void;
  setStatus: (value: ClaimStatus) => void;
};

export function StatusUpdateSection({
  allowanceOverrideReason,
  hasStatusChanged,
  note,
  renderedStatusOptions,
  requiresAcceptedRecoveryAgreement,
  requiresAcceptedRecoveryCollectionPath,
  requiresAcceptedRecoveryDecision,
  requiresCommercialScopeRestriction,
  requiresMatterAllowanceGuard,
  resolvedCommercialScope,
  status,
  onStatusUpdate,
  setAllowanceOverrideReason,
  setNote,
  setStatus,
}: StatusUpdateSectionProps) {
  const { isPending, t } = useClaimActionPanel();

  return (
    <div className="space-y-4 border-t pt-6">
      <div className="space-y-2">
        <label htmlFor="claim-status-select" className="text-sm font-medium">
          {t('staff_actions.status_update.title')}
        </label>
        <Select
          value={status}
          onValueChange={value => setStatus(value as ClaimStatus)}
          disabled={isPending}
        >
          <SelectTrigger id="claim-status-select">
            <SelectValue placeholder={t('staff_actions.status_update.select_status')} />
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
          {t('staff_actions.status_update.note_label')}{' '}
          <span className="text-xs text-muted-foreground">
            ({t('staff_actions.status_update.visible_to_member')})
          </span>
        </label>
        <Textarea
          id="claim-status-note"
          placeholder={t('staff_actions.status_update.note_placeholder')}
          value={note}
          onChange={event => setNote(event.target.value)}
          disabled={isPending}
          className="min-h-[80px]"
        />
      </div>

      {requiresAcceptedRecoveryDecision ? (
        <p className="text-xs text-muted-foreground">
          {t('staff_actions.status_update.requires_recovery_decision')}
        </p>
      ) : null}

      {requiresCommercialScopeRestriction ? (
        <p className="text-xs text-muted-foreground">{resolvedCommercialScope.enforcementError}</p>
      ) : null}

      {requiresAcceptedRecoveryAgreement ? (
        <p className="text-xs text-muted-foreground">
          {t('staff_actions.status_update.requires_escalation_agreement')}
        </p>
      ) : null}

      {requiresAcceptedRecoveryCollectionPath ? (
        <p className="text-xs text-muted-foreground">
          {t('staff_actions.status_update.requires_collection_path')}
        </p>
      ) : null}

      {requiresMatterAllowanceGuard ? (
        <div className="space-y-2">
          <label htmlFor="claim-status-allowance-override" className="text-sm font-medium">
            {t('staff_actions.status_update.allowance_override_reason')}{' '}
            <span className="text-xs text-muted-foreground">({t('staff_actions.staff_only')})</span>
          </label>
          <p className="text-xs text-muted-foreground">
            {t('staff_actions.status_update.allowance_override_description')}
          </p>
          <Textarea
            id="claim-status-allowance-override"
            placeholder={t('staff_actions.status_update.allowance_override_placeholder')}
            value={allowanceOverrideReason}
            onChange={event => setAllowanceOverrideReason(event.target.value)}
            disabled={isPending}
            className="min-h-[80px]"
          />
        </div>
      ) : null}

      <Button
        className="w-full"
        onClick={onStatusUpdate}
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
        {t('staff_actions.status_update.save')}
      </Button>
    </div>
  );
}
