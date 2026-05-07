'use client';

import { Button } from '@interdomestik/ui';
import { Loader2 } from 'lucide-react';

import { useClaimActionPanel } from './context';
import type { RenderedAssignmentOption } from './assignment-helpers';

type AssignmentSectionProps = {
  assignmentLabel: string;
  renderedAssignmentOptions: ReadonlyArray<RenderedAssignmentOption>;
  selectedAssigneeId: string;
  setSelectedAssigneeId: (value: string) => void;
  hasAssignmentChanged: boolean;
  hasAssignableOptions: boolean;
  onAssign: () => void;
};

export function AssignmentSection({
  assignmentLabel,
  renderedAssignmentOptions,
  selectedAssigneeId,
  setSelectedAssigneeId,
  hasAssignmentChanged,
  hasAssignableOptions,
  onAssign,
}: AssignmentSectionProps) {
  const { isPending, t } = useClaimActionPanel();

  return (
    <div className="rounded-lg bg-muted/30 p-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm font-medium">{t('staff_actions.assignment.title')}</p>
          <p className="text-xs text-muted-foreground" data-testid="staff-assignment-current">
            {assignmentLabel}
          </p>
        </div>
        <div className="flex w-full flex-col gap-2 sm:w-auto sm:min-w-[16rem]">
          <label htmlFor="staff-assignment-select" className="text-xs font-medium text-slate-700">
            {t('staff_actions.assignment.assign_claim')}
          </label>
          <select
            id="staff-assignment-select"
            className="h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
            data-testid="staff-assignment-select"
            disabled={isPending || !hasAssignableOptions}
            onChange={event => setSelectedAssigneeId(event.target.value)}
            value={selectedAssigneeId}
          >
            {renderedAssignmentOptions.map(option => (
              <option key={option.id} value={option.id} disabled={option.disabled}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      </div>
      <div className="mt-3 flex justify-end">
        <Button
          size="sm"
          onClick={onAssign}
          disabled={isPending || !hasAssignmentChanged}
          data-testid="staff-assign-claim-button"
        >
          {isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {t('staff_actions.assignment.save')}
        </Button>
      </div>
    </div>
  );
}
