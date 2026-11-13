import type { TranslateFn } from './format-helpers';

export type AssignmentOption = {
  id: string;
  label: string;
};

export type RenderedAssignmentOption = AssignmentOption & {
  disabled?: boolean;
};

export function hasAssignmentOption(
  assignmentOptions: ReadonlyArray<AssignmentOption>,
  assigneeId: string
) {
  return assignmentOptions.some(option => option.id === assigneeId);
}

// An unassigned claim starts on the placeholder: preselecting anyone would contradict the
// "unassigned" status shown next to the select and invite an accidental save.
export function getSelectedAssigneeId(assigneeId: string | null): string {
  return assigneeId ?? '';
}

export function getOutOfScopeAssigneeOption(args: {
  assignmentOptions: ReadonlyArray<AssignmentOption>;
  assigneeId: string | null;
  currentAssigneeLabel?: string | null;
  t: TranslateFn;
}): RenderedAssignmentOption | null {
  if (args.assigneeId === null || hasAssignmentOption(args.assignmentOptions, args.assigneeId)) {
    return null;
  }

  return {
    id: args.assigneeId,
    label: args.t('staff_actions.assignment.out_of_scope', {
      name: args.currentAssigneeLabel ?? args.t('staff_actions.assignment.current_assignee'),
    }),
    disabled: true,
  };
}

export const UNASSIGNED_PLACEHOLDER_OPTION_ID = '';

export function getRenderedAssignmentOptions(args: {
  assignmentOptions: ReadonlyArray<AssignmentOption>;
  assigneeId: string | null;
  currentAssigneeLabel?: string | null;
  t: TranslateFn;
}): ReadonlyArray<RenderedAssignmentOption> {
  if (args.assigneeId === null) {
    const placeholder: RenderedAssignmentOption = {
      id: UNASSIGNED_PLACEHOLDER_OPTION_ID,
      label: args.t('staff_actions.assignment.choose_assignee'),
      disabled: true,
    };
    return [placeholder, ...args.assignmentOptions];
  }
  const outOfScopeAssigneeOption = getOutOfScopeAssigneeOption(args);
  return outOfScopeAssigneeOption
    ? [outOfScopeAssigneeOption, ...args.assignmentOptions]
    : args.assignmentOptions;
}

export function getAssignmentSuccessDescription(args: {
  nextAssigneeId: string | null;
  selectedAssignmentLabel: string | null;
  staffId: string;
  t: TranslateFn;
}) {
  if (args.nextAssigneeId === args.staffId) {
    return args.t('staff_actions.success.assignment_self');
  }

  if (args.selectedAssignmentLabel) {
    return args.t('staff_actions.success.assignment_named', {
      name: args.selectedAssignmentLabel,
    });
  }

  return args.t('staff_actions.success.assignment_updated');
}

export function getAssignmentLabel(args: {
  assigneeId: string | null;
  currentAssigneeLabel?: string | null;
  isAssignedToMe: boolean;
  t: TranslateFn;
}) {
  if (args.assigneeId === null) {
    return args.t('staff_actions.assignment.unassigned');
  }

  if (args.isAssignedToMe) {
    return args.t('staff_actions.assignment.assigned_to_you');
  }

  if (args.currentAssigneeLabel) {
    return args.t('staff_actions.assignment.assigned_to_named', {
      name: args.currentAssigneeLabel,
    });
  }

  return args.t('staff_actions.assignment.assigned_to_colleague');
}
