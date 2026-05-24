import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  cancellationSubmitMock: vi.fn(),
  dueDateSubmitMock: vi.fn(),
  prioritySubmitMock: vi.fn(),
  refreshMock: vi.fn(),
  lifecycleSubmitMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: hoisted.refreshMock,
  }),
}));

const translations: Record<string, string> = {
  'actions.complete': 'Complete',
  'actions.completing': 'Completing...',
  'actions.error.conflict': 'Changed',
  'actions.error.rate_limited': 'Wait',
  'actions.error.transient': 'Try again',
  'actions.error.unavailable': 'Unavailable',
  'actions.group': 'Task actions',
  'actions.start': 'Start',
  'actions.starting': 'Starting...',
  'actions.success.complete': 'Completed',
  'actions.success.start': 'Started',
  'secondaryActions.close': 'Close actions',
  'secondaryActions.closeFor': 'Close actions for {label}',
  'secondaryActions.group': 'Secondary task actions',
  'secondaryActions.groupFor': 'Secondary task actions for {label}',
  'secondaryActions.open': 'More actions',
  'secondaryActions.openFor': 'More actions for {label}',
  'cancelActions.confirm': 'Confirm cancellation',
  'cancelActions.confirmGroup': 'Confirm task cancellation',
  'cancelActions.confirmGroupFor': 'Confirm task cancellation for {label}',
  'cancelActions.confirming': 'Cancelling...',
  'cancelActions.dismiss': 'Keep task',
  'cancelActions.error.conflict': 'Task changed before cancellation',
  'cancelActions.error.invalid_reason': 'Select a cancellation reason',
  'cancelActions.error.rate_limited': 'Wait to cancel',
  'cancelActions.error.transient': 'Try cancel again',
  'cancelActions.error.unavailable': 'Cancellation unavailable',
  'cancelActions.field': 'Cancellation reason',
  'cancelActions.group': 'Task cancellation actions',
  'cancelActions.groupFor': 'Task cancellation actions for {label}',
  'cancelActions.open': 'Cancel task',
  'cancelActions.openFor': 'Cancel task for {label}',
  'cancelActions.placeholder': 'Select reason',
  'cancelActions.reasons.created_in_error': 'Created in error',
  'cancelActions.reasons.duplicate': 'Duplicate task',
  'cancelActions.reasons.not_needed': 'Not needed',
  'cancelActions.success': 'Task cancelled',
  'dueActions.cancel': 'Cancel',
  'dueActions.clear': 'Clear due date',
  'dueActions.clearing': 'Clearing...',
  'dueActions.edit': 'Edit due date',
  'dueActions.error.conflict': 'Due date changed',
  'dueActions.error.invalid_date': 'Invalid date',
  'dueActions.error.rate_limited': 'Wait to update due date',
  'dueActions.error.transient': 'Try date again',
  'dueActions.error.unavailable': 'Due date unavailable',
  'dueActions.field': 'Due date and time',
  'dueActions.group': 'Due date actions',
  'dueActions.save': 'Save due date',
  'dueActions.saving': 'Saving...',
  'dueActions.success.clear': 'Due date cleared',
  'dueActions.success.set': 'Due date updated',
  'priority.high': 'High',
  'priority.low': 'Low',
  'priority.normal': 'Normal',
  'priority.urgent': 'Urgent',
  'priorityActions.error.conflict': 'Priority changed',
  'priorityActions.error.invalid_priority': 'Invalid priority',
  'priorityActions.error.rate_limited': 'Wait to update priority',
  'priorityActions.error.terminal': 'Priority unavailable',
  'priorityActions.error.transient': 'Try priority again',
  'priorityActions.error.unavailable': 'Priority unavailable',
  'priorityActions.field': 'Task priority',
  'priorityActions.fieldFor': 'Task priority for {label}',
  'priorityActions.group': 'Priority actions',
  'priorityActions.groupFor': 'Priority actions for {label}',
  'priorityActions.save': 'Save priority',
  'priorityActions.saveFor': 'Save priority for {label}',
  'priorityActions.saving': 'Saving...',
  'priorityActions.success': 'Priority updated',
};

vi.mock('next-intl', () => ({
  useTranslations: (namespace: string) => (key: string, values?: Record<string, string>) => {
    const prefix =
      namespace === 'agent-crm.crm.taskQueue'
        ? ''
        : namespace.replace('agent-crm.crm.taskQueue.', '');
    let message = translations[prefix ? `${prefix}.${key}` : key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) {
      message = message.replaceAll(`{${name}}`, value);
    }
    return message;
  },
}));

vi.mock('./task-queue-actions', () => ({
  submitAgentCrmTaskQueueCancellationAction: hoisted.cancellationSubmitMock,
  submitAgentCrmTaskQueueDueDateAction: hoisted.dueDateSubmitMock,
  submitAgentCrmTaskQueueLifecycleAction: hoisted.lifecycleSubmitMock,
  submitAgentCrmTaskQueuePriorityAction: hoisted.prioritySubmitMock,
}));

import { TaskQueueControls } from './task-queue-controls';

type RenderControlsOptions = {
  readonly expectedLifecycleVersion?: number;
  readonly priority?: 'low' | 'normal' | 'high' | 'urgent';
  readonly rowLabel?: string;
  readonly status?: 'pending' | 'in_progress';
  readonly taskId?: string;
};

function renderControls({
  expectedLifecycleVersion = 2,
  priority = 'normal',
  rowLabel = 'Lead One',
  status = 'pending',
  taskId = 'task-1',
}: RenderControlsOptions = {}) {
  return render(
    <TaskQueueControls
      rowLabel={rowLabel}
      expectedLifecycleVersion={expectedLifecycleVersion}
      priority={priority}
      status={status}
      taskId={taskId}
    />
  );
}

function openSecondaryActions() {
  fireEvent.click(screen.getByTestId('agent-crm-task-queue-secondary-toggle'));
}

describe('TaskQueueControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.dueDateSubmitMock.mockResolvedValue({
      dueAt: '2026-05-22T10:00:00.000Z',
      success: true,
    });
    hoisted.cancellationSubmitMock.mockResolvedValue({
      reasonCode: 'not_needed',
      success: true,
    });
    hoisted.lifecycleSubmitMock.mockResolvedValue({ action: 'start', success: true });
    hoisted.prioritySubmitMock.mockResolvedValue({ priority: 'urgent', success: true });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders start and complete controls for pending rows', () => {
    renderControls();

    expect(screen.getByTestId('agent-crm-task-queue-start')).toHaveTextContent('Start');
    expect(screen.getByTestId('agent-crm-task-queue-complete')).toHaveTextContent('Complete');
    const secondaryToggle = screen.getByTestId('agent-crm-task-queue-secondary-toggle');
    expect(secondaryToggle).toHaveTextContent('More actions');
    expect(secondaryToggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('agent-crm-task-queue-due-edit')).toBeNull();
    expect(screen.queryByTestId('agent-crm-task-queue-priority-select')).toBeNull();
    expect(screen.queryByTestId('agent-crm-task-queue-cancel')).toBeNull();
    openSecondaryActions();
    expect(secondaryToggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('group', { name: 'Secondary task actions for Lead One' })).toBeTruthy();
    expect(screen.getByTestId('agent-crm-task-queue-due-edit')).toHaveTextContent('Edit due date');
    expect(screen.getByTestId('agent-crm-task-queue-priority-select')).toHaveValue('normal');
    expect(screen.getByTestId('agent-crm-task-queue-priority-save')).toBeDisabled();
    expect(screen.getByTestId('agent-crm-task-queue-cancel')).toHaveTextContent('Cancel task');
    expect(screen.getByRole('group', { name: 'Task actions' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Due date actions' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Priority actions for Lead One' })).toBeTruthy();
    expect(screen.getByTestId('agent-crm-task-queue-priority-select')).toHaveAccessibleName(
      'Task priority for Lead One'
    );
    expect(screen.getByTestId('agent-crm-task-queue-priority-save')).toHaveAccessibleName(
      'Save priority for Lead One'
    );
    expect(
      screen.getByRole('group', { name: 'Task cancellation actions for Lead One' })
    ).toBeTruthy();
    expect(screen.getByTestId('agent-crm-task-queue-cancel')).toHaveAccessibleName(
      'Cancel task for Lead One'
    );
  });

  it('renders only complete for in-progress rows', () => {
    renderControls({ status: 'in_progress' });

    expect(screen.queryByTestId('agent-crm-task-queue-start')).toBeNull();
    expect(screen.getByTestId('agent-crm-task-queue-complete')).toHaveTextContent('Complete');
    expect(screen.queryByTestId('agent-crm-task-queue-due-edit')).toBeNull();
    openSecondaryActions();
    expect(screen.getByTestId('agent-crm-task-queue-due-edit')).toHaveTextContent('Edit due date');
    expect(screen.getByTestId('agent-crm-task-queue-cancel')).toHaveTextContent('Cancel task');
  });

  it('submits the current task id and lifecycle version without optimistic row mutation', async () => {
    renderControls({ expectedLifecycleVersion: 7, taskId: 'task-7' });

    fireEvent.click(screen.getByTestId('agent-crm-task-queue-start'));

    await waitFor(() => {
      expect(hoisted.lifecycleSubmitMock).toHaveBeenCalledWith({
        action: 'start',
        expectedLifecycleVersion: 7,
        taskId: 'task-7',
      });
    });
    expect(hoisted.refreshMock).toHaveBeenCalled();
    expect(screen.getByText('Started')).toBeTruthy();
  });

  it('keeps failures row-local and displays only stable UI copy', async () => {
    hoisted.lifecycleSubmitMock.mockResolvedValueOnce({
      action: 'complete',
      error: 'conflict',
      success: false,
    });

    renderControls({ expectedLifecycleVersion: 7, status: 'in_progress', taskId: 'task-7' });

    fireEvent.click(screen.getByTestId('agent-crm-task-queue-complete'));

    await waitFor(() => {
      expect(screen.getByText('Changed')).toBeTruthy();
    });
    expect(hoisted.refreshMock).not.toHaveBeenCalled();
    expect(screen.queryByText('lifecycle_conflict')).toBeNull();
  });

  it('restores the row after unexpected submission failures', async () => {
    hoisted.lifecycleSubmitMock.mockRejectedValueOnce(new Error('network unavailable'));

    renderControls({ expectedLifecycleVersion: 7, taskId: 'task-7' });

    fireEvent.click(screen.getByTestId('agent-crm-task-queue-start'));

    await waitFor(() => {
      expect(screen.getByText('Try again')).toBeTruthy();
    });
    expect(screen.getByTestId('agent-crm-task-queue-start')).not.toBeDisabled();
    expect(hoisted.refreshMock).not.toHaveBeenCalled();
  });

  it('submits a normalized due-date update without optimistic row mutation', async () => {
    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-edit'));
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-due-input'), {
      target: { value: '2026-05-22T12:30' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-save'));

    await waitFor(() => {
      expect(hoisted.dueDateSubmitMock).toHaveBeenCalledWith({
        dueAt: new Date('2026-05-22T12:30').toISOString(),
        expectedLifecycleVersion: 8,
        taskId: 'task-8',
      });
    });
    expect(hoisted.refreshMock).toHaveBeenCalled();
    expect(screen.getByText('Due date updated')).toBeTruthy();
    expect(screen.queryByTestId('agent-crm-task-queue-secondary-panel')).toBeNull();
  });

  it('submits a priority update with stable row-local state', async () => {
    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    openSecondaryActions();
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-priority-select'), {
      target: { value: 'urgent' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-priority-save'));

    await waitFor(() => {
      expect(hoisted.prioritySubmitMock).toHaveBeenCalledWith({
        expectedLifecycleVersion: 8,
        priority: 'urgent',
        taskId: 'task-8',
      });
    });
    expect(hoisted.refreshMock).toHaveBeenCalled();
    expect(screen.getByText('Priority updated')).toBeTruthy();
    expect(screen.queryByTestId('agent-crm-task-queue-secondary-panel')).toBeNull();
  });

  it('suppresses duplicate priority submissions while the row is pending', async () => {
    let resolvePriority:
      | ((value: { readonly priority: 'urgent'; readonly success: true }) => void)
      | undefined;
    hoisted.prioritySubmitMock.mockReturnValueOnce(
      new Promise(resolve => {
        resolvePriority = resolve;
      })
    );

    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    openSecondaryActions();
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-priority-select'), {
      target: { value: 'urgent' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-priority-save'));

    await waitFor(() => {
      expect(screen.getByTestId('agent-crm-task-queue-priority-select')).toBeDisabled();
    });
    expect(screen.getByTestId('agent-crm-task-queue-priority-save')).toBeDisabled();
    expect(screen.getAllByText('Saving...').length).toBeGreaterThan(0);

    fireEvent.click(screen.getByTestId('agent-crm-task-queue-priority-save'));
    expect(hoisted.prioritySubmitMock).toHaveBeenCalledTimes(1);

    resolvePriority?.({ priority: 'urgent', success: true });
    await waitFor(() => {
      expect(screen.getByText('Priority updated')).toBeTruthy();
    });
  });

  it('keeps priority failures row-local and displays only stable UI copy', async () => {
    hoisted.prioritySubmitMock.mockResolvedValueOnce({
      error: 'conflict',
      success: false,
    });

    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    openSecondaryActions();
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-priority-select'), {
      target: { value: 'high' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-priority-save'));

    await waitFor(() => {
      expect(screen.getByText('Priority changed')).toBeTruthy();
    });
    expect(screen.queryByText('lifecycle_conflict')).toBeNull();
    expect(hoisted.refreshMock).not.toHaveBeenCalled();
  });

  it('requires an explicit cancellation reason before confirming cancellation', () => {
    renderControls({ expectedLifecycleVersion: 9, taskId: 'task-9' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel'));

    expect(
      screen.getByRole('group', { name: 'Confirm task cancellation for Lead One' })
    ).toBeTruthy();
    expect(screen.getByTestId('agent-crm-task-queue-cancel-reason')).toHaveTextContent(
      'Not needed'
    );
    expect(screen.getByTestId('agent-crm-task-queue-cancel-reason')).toHaveTextContent(
      'Duplicate task'
    );
    expect(screen.getByTestId('agent-crm-task-queue-cancel-reason')).toHaveTextContent(
      'Created in error'
    );
    expect(screen.getByTestId('agent-crm-task-queue-cancel-reason')).not.toHaveTextContent(
      'subject_closed'
    );
    expect(screen.getByTestId('agent-crm-task-queue-cancel-confirm')).toBeDisabled();
    expect(hoisted.cancellationSubmitMock).not.toHaveBeenCalled();
  });

  it('dismisses cancellation confirmation back to the row-local cancel control', () => {
    renderControls({ expectedLifecycleVersion: 9, taskId: 'task-9' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel'));
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel-dismiss'));

    expect(screen.queryByTestId('agent-crm-task-queue-cancel-reason')).toBeNull();
    expect(screen.getByTestId('agent-crm-task-queue-cancel')).toHaveTextContent('Cancel task');
    expect(hoisted.cancellationSubmitMock).not.toHaveBeenCalled();
  });

  it('submits cancellation with selected reason and refreshes after success', async () => {
    renderControls({ expectedLifecycleVersion: 9, taskId: 'task-9' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel'));
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-cancel-reason'), {
      target: { value: 'created_in_error' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel-confirm'));

    await waitFor(() => {
      expect(hoisted.cancellationSubmitMock).toHaveBeenCalledWith({
        expectedLifecycleVersion: 9,
        reasonCode: 'created_in_error',
        taskId: 'task-9',
      });
    });
    expect(hoisted.refreshMock).toHaveBeenCalled();
    expect(screen.getByText('Task cancelled')).toBeTruthy();
  });

  it.each([
    {
      error: 'conflict',
      leakedText: 'terminal_state',
      text: 'Task changed before cancellation',
    },
    {
      error: 'rate_limited',
      leakedText: 'rate_limited',
      text: 'Wait to cancel',
    },
    {
      error: 'transient',
      leakedText: 'repository_failure',
      text: 'Try cancel again',
    },
  ] as const)('keeps cancellation $error failures row-local', async scenario => {
    hoisted.cancellationSubmitMock.mockResolvedValueOnce({
      error: scenario.error,
      success: false,
    });

    renderControls({ expectedLifecycleVersion: 9, taskId: 'task-9' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel'));
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-cancel-reason'), {
      target: { value: 'not_needed' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel-confirm'));

    await waitFor(() => {
      expect(screen.getByText(scenario.text)).toBeTruthy();
    });
    expect(screen.queryByText(scenario.leakedText)).toBeNull();
    expect(hoisted.refreshMock).not.toHaveBeenCalled();
  });

  it('disables sibling row controls while cancellation is pending', async () => {
    let resolveCancellation: (value: {
      reasonCode: 'not_needed';
      success: true;
    }) => void = () => {};
    hoisted.cancellationSubmitMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveCancellation = resolve;
        })
    );

    renderControls({ expectedLifecycleVersion: 9, taskId: 'task-9' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel'));
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-cancel-reason'), {
      target: { value: 'not_needed' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('agent-crm-task-queue-start')).toBeDisabled();
    });
    expect(screen.getByTestId('agent-crm-task-queue-complete')).toBeDisabled();
    expect(screen.getByTestId('agent-crm-task-queue-due-edit')).toBeDisabled();

    resolveCancellation({ reasonCode: 'not_needed', success: true });
    await waitFor(() => {
      expect(hoisted.refreshMock).toHaveBeenCalled();
    });
  });

  it('keeps adjacent rows enabled while one row cancellation is pending', async () => {
    let resolveCancellation: (value: {
      reasonCode: 'not_needed';
      success: true;
    }) => void = () => {};
    hoisted.cancellationSubmitMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveCancellation = resolve;
        })
    );

    render(
      <div>
        <div data-testid="row-one">
          <TaskQueueControls
            rowLabel="Lead One"
            expectedLifecycleVersion={9}
            priority="normal"
            status="pending"
            taskId="task-9"
          />
        </div>
        <div data-testid="row-two">
          <TaskQueueControls
            rowLabel="Lead Two"
            expectedLifecycleVersion={10}
            priority="high"
            status="pending"
            taskId="task-10"
          />
        </div>
      </div>
    );

    const rowOne = within(screen.getByTestId('row-one'));
    const rowTwo = within(screen.getByTestId('row-two'));

    fireEvent.click(rowOne.getByTestId('agent-crm-task-queue-secondary-toggle'));
    fireEvent.click(rowOne.getByTestId('agent-crm-task-queue-cancel'));
    fireEvent.change(rowOne.getByTestId('agent-crm-task-queue-cancel-reason'), {
      target: { value: 'not_needed' },
    });
    fireEvent.click(rowOne.getByTestId('agent-crm-task-queue-cancel-confirm'));

    await waitFor(() => {
      expect(rowOne.getByTestId('agent-crm-task-queue-start')).toBeDisabled();
    });
    expect(rowTwo.getByTestId('agent-crm-task-queue-start')).not.toBeDisabled();
    expect(rowTwo.getByTestId('agent-crm-task-queue-complete')).not.toBeDisabled();
    expect(rowTwo.getByTestId('agent-crm-task-queue-secondary-toggle')).not.toBeDisabled();

    resolveCancellation({ reasonCode: 'not_needed', success: true });
    await waitFor(() => {
      expect(hoisted.refreshMock).toHaveBeenCalled();
    });
  });

  it('clears the due date through the row-local due-date control', async () => {
    hoisted.dueDateSubmitMock.mockResolvedValueOnce({ dueAt: null, success: true });

    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-edit'));
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-clear'));

    await waitFor(() => {
      expect(hoisted.dueDateSubmitMock).toHaveBeenCalledWith({
        dueAt: null,
        expectedLifecycleVersion: 8,
        taskId: 'task-8',
      });
    });
    expect(screen.getByText('Due date cleared')).toBeTruthy();
  });

  it('keeps empty save separate from the clear due-date action', async () => {
    hoisted.dueDateSubmitMock.mockResolvedValueOnce({ dueAt: null, success: true });

    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-edit'));
    expect(screen.getByTestId('agent-crm-task-queue-due-save')).toBeDisabled();

    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-clear'));

    await waitFor(() => {
      expect(hoisted.dueDateSubmitMock).toHaveBeenCalledWith({
        dueAt: null,
        expectedLifecycleVersion: 8,
        taskId: 'task-8',
      });
    });
    expect(screen.getByText('Due date cleared')).toBeTruthy();
  });

  it('closes the secondary panel with Escape and returns focus to the disclosure trigger', () => {
    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    const trigger = screen.getByTestId('agent-crm-task-queue-secondary-toggle');
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByTestId('agent-crm-task-queue-secondary-panel')).toBeTruthy();
    const dueEdit = screen.getByTestId('agent-crm-task-queue-due-edit');
    expect(document.activeElement).toBe(dueEdit);

    fireEvent.keyDown(dueEdit, {
      key: 'Escape',
    });

    expect(screen.queryByTestId('agent-crm-task-queue-secondary-panel')).toBeNull();
    expect(document.activeElement).toBe(trigger);
  });

  it('discards secondary-control drafts when the panel closes', () => {
    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-edit'));
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-due-input'), {
      target: { value: '2026-05-22T12:30' },
    });
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-priority-select'), {
      target: { value: 'urgent' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-secondary-close'));

    openSecondaryActions();
    expect(screen.getByTestId('agent-crm-task-queue-due-edit')).toHaveTextContent('Edit due date');
    expect(screen.queryByTestId('agent-crm-task-queue-due-input')).toBeNull();
    expect(screen.getByTestId('agent-crm-task-queue-priority-select')).toHaveValue('normal');
    expect(screen.getByTestId('agent-crm-task-queue-priority-save')).toBeDisabled();
  });

  it.each([
    {
      close: () => fireEvent.click(screen.getByTestId('agent-crm-task-queue-secondary-toggle')),
      name: 'disclosure trigger',
    },
    {
      close: () =>
        fireEvent.keyDown(screen.getByTestId('agent-crm-task-queue-due-input'), { key: 'Escape' }),
      name: 'Escape',
    },
  ])('discards secondary-control drafts when closed with $name', ({ close }) => {
    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-edit'));
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-due-input'), {
      target: { value: '2026-05-22T12:30' },
    });
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-priority-select'), {
      target: { value: 'urgent' },
    });
    close();

    openSecondaryActions();
    expect(screen.getByTestId('agent-crm-task-queue-due-edit')).toHaveTextContent('Edit due date');
    expect(screen.queryByTestId('agent-crm-task-queue-due-input')).toBeNull();
    expect(screen.getByTestId('agent-crm-task-queue-priority-select')).toHaveValue('normal');
    expect(screen.getByTestId('agent-crm-task-queue-priority-save')).toBeDisabled();
  });

  it('disables due-date and priority controls while cancellation confirmation is open', () => {
    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-edit'));
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-due-input'), {
      target: { value: '2026-05-22T12:30' },
    });
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-priority-select'), {
      target: { value: 'urgent' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel'));

    expect(screen.queryByTestId('agent-crm-task-queue-due-input')).toBeNull();
    expect(screen.getByTestId('agent-crm-task-queue-due-edit')).toBeDisabled();
    expect(screen.getByTestId('agent-crm-task-queue-priority-select')).toBeDisabled();
    expect(screen.getByTestId('agent-crm-task-queue-priority-select')).toHaveValue('normal');
    expect(screen.getByTestId('agent-crm-task-queue-priority-save')).toBeDisabled();

    fireEvent.click(screen.getByTestId('agent-crm-task-queue-cancel-dismiss'));
    expect(screen.getByTestId('agent-crm-task-queue-due-edit')).not.toBeDisabled();
    expect(screen.getByTestId('agent-crm-task-queue-priority-select')).not.toBeDisabled();
  });

  it.each([
    {
      error: 'invalid_date',
      leakedText: null,
      name: 'renders server-side invalid-date failures as stable row-local copy',
      text: 'Invalid date',
    },
    {
      error: 'conflict',
      leakedText: 'lifecycle_conflict',
      name: 'keeps due-date failures row-local and displays only stable UI copy',
      text: 'Due date changed',
    },
  ] as const)('$name', async scenario => {
    hoisted.dueDateSubmitMock.mockResolvedValueOnce({
      error: scenario.error,
      success: false,
    });

    renderControls({ expectedLifecycleVersion: 8, taskId: 'task-8' });

    openSecondaryActions();
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-edit'));
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-due-input'), {
      target: { value: '2026-05-22T12:30' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-save'));

    await waitFor(() => {
      expect(screen.getByText(scenario.text)).toBeTruthy();
    });
    if (scenario.leakedText) {
      expect(screen.queryByText(scenario.leakedText)).toBeNull();
    }
    expect(hoisted.refreshMock).not.toHaveBeenCalled();
  });
});
