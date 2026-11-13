import { describe, expect, it } from 'vitest';
import {
  getOutOfScopeAssigneeOption,
  getSelectedAssigneeId,
  UNASSIGNED_PLACEHOLDER_OPTION_ID,
} from './assignment-helpers';

const OPTIONS = [
  { id: 'staff-me', label: 'Drita Gashi' },
  { id: 'staff-other', label: 'Other Staff' },
] as const;

const t = (key: string, values?: Record<string, string | number>): string =>
  values ? `${key}:${JSON.stringify(values)}` : key;

describe('staff assignment helpers', () => {
  it('starts an unassigned claim on the placeholder instead of preselecting a staff member', () => {
    expect(
      getSelectedAssigneeId({ assignmentOptions: OPTIONS, assigneeId: null, staffId: 'staff-me' })
    ).toBe(UNASSIGNED_PLACEHOLDER_OPTION_ID);
  });

  it('keeps the current assignee selected for an assigned claim', () => {
    expect(
      getSelectedAssigneeId({
        assignmentOptions: OPTIONS,
        assigneeId: 'staff-other',
        staffId: 'staff-me',
      })
    ).toBe('staff-other');
  });

  it('leads with a disabled localized placeholder when the claim is unassigned', () => {
    expect(
      getOutOfScopeAssigneeOption({ assignmentOptions: OPTIONS, assigneeId: null, t })
    ).toEqual({
      id: UNASSIGNED_PLACEHOLDER_OPTION_ID,
      label: 'staff_actions.assignment.choose_assignee',
      disabled: true,
    });
  });

  it('adds no leading option for an in-scope assignee', () => {
    expect(
      getOutOfScopeAssigneeOption({ assignmentOptions: OPTIONS, assigneeId: 'staff-me', t })
    ).toBeNull();
  });

  it('keeps the disabled out-of-scope option for an assignee outside the options', () => {
    expect(
      getOutOfScopeAssigneeOption({
        assignmentOptions: OPTIONS,
        assigneeId: 'staff-out',
        currentAssigneeLabel: 'Outside Staff',
        t,
      })
    ).toMatchObject({ id: 'staff-out', disabled: true });
  });
});
