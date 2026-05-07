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

export function getSelectedAssigneeId(args: {
  assignmentOptions: ReadonlyArray<AssignmentOption>;
  assigneeId: string | null;
  staffId: string;
}) {
  if (args.assigneeId !== null) {
    return args.assigneeId;
  }

  if (hasAssignmentOption(args.assignmentOptions, args.staffId)) {
    return args.staffId;
  }

  return args.assignmentOptions[0]?.id ?? '';
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
