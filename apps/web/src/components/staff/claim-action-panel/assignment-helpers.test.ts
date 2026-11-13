import { describe, expect, it } from 'vitest';
import {
  getRenderedAssignmentOptions,
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
    expect(getSelectedAssigneeId(null)).toBe(UNASSIGNED_PLACEHOLDER_OPTION_ID);
  });

  it('keeps the current assignee selected for an assigned claim', () => {
    expect(getSelectedAssigneeId('staff-other')).toBe('staff-other');
  });

  it('renders a disabled localized placeholder first when the claim is unassigned', () => {
    const rendered = getRenderedAssignmentOptions({
      assignmentOptions: OPTIONS,
      assigneeId: null,
      t,
    });

    expect(rendered[0]).toEqual({
      id: UNASSIGNED_PLACEHOLDER_OPTION_ID,
      label: 'staff_actions.assignment.choose_assignee',
      disabled: true,
    });
    expect(rendered.slice(1)).toEqual(OPTIONS);
  });

  it('renders no placeholder for an in-scope assignee', () => {
    expect(
      getRenderedAssignmentOptions({ assignmentOptions: OPTIONS, assigneeId: 'staff-me', t })
    ).toEqual(OPTIONS);
  });

  it('keeps the disabled out-of-scope option for an assignee outside the options', () => {
    const rendered = getRenderedAssignmentOptions({
      assignmentOptions: OPTIONS,
      assigneeId: 'staff-out',
      currentAssigneeLabel: 'Outside Staff',
      t,
    });

    expect(rendered[0]).toMatchObject({ id: 'staff-out', disabled: true });
    expect(rendered).toHaveLength(OPTIONS.length + 1);
  });
});
