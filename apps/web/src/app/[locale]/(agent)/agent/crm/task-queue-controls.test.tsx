import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  dueDateSubmitMock: vi.fn(),
  refreshMock: vi.fn(),
  lifecycleSubmitMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: hoisted.refreshMock,
  }),
}));

vi.mock('./task-queue-actions', () => ({
  submitAgentCrmTaskQueueDueDateAction: hoisted.dueDateSubmitMock,
  submitAgentCrmTaskQueueLifecycleAction: hoisted.lifecycleSubmitMock,
}));

import { TaskQueueControls, type TaskQueueControlsLabels } from './task-queue-controls';

const labels: TaskQueueControlsLabels = {
  complete: 'Complete',
  completing: 'Completing...',
  due: {
    cancel: 'Cancel',
    clear: 'Clear due date',
    clearing: 'Clearing...',
    edit: 'Edit due date',
    error: {
      conflict: 'Due date changed',
      invalid_date: 'Invalid date',
      rate_limited: 'Wait to update due date',
      transient: 'Try date again',
      unavailable: 'Due date unavailable',
    },
    field: 'Due date and time',
    group: 'Due date actions',
    save: 'Save due date',
    saving: 'Saving...',
    success: {
      clear: 'Due date cleared',
      set: 'Due date updated',
    },
  },
  error: {
    conflict: 'Changed',
    rate_limited: 'Wait',
    transient: 'Try again',
    unavailable: 'Unavailable',
  },
  group: 'Task actions',
  start: 'Start',
  starting: 'Starting...',
  success: {
    complete: 'Completed',
    start: 'Started',
  },
};

describe('TaskQueueControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.dueDateSubmitMock.mockResolvedValue({
      dueAt: '2026-05-22T10:00:00.000Z',
      success: true,
    });
    hoisted.lifecycleSubmitMock.mockResolvedValue({ action: 'start', success: true });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders start and complete controls for pending rows', () => {
    render(
      <TaskQueueControls
        expectedLifecycleVersion={2}
        labels={labels}
        status="pending"
        taskId="task-1"
      />
    );

    expect(screen.getByTestId('agent-crm-task-queue-start')).toHaveTextContent('Start');
    expect(screen.getByTestId('agent-crm-task-queue-complete')).toHaveTextContent('Complete');
    expect(screen.getByTestId('agent-crm-task-queue-due-edit')).toHaveTextContent('Edit due date');
    expect(screen.getByRole('group', { name: 'Task actions' })).toBeTruthy();
    expect(screen.getByRole('group', { name: 'Due date actions' })).toBeTruthy();
  });

  it('renders only complete for in-progress rows', () => {
    render(
      <TaskQueueControls
        expectedLifecycleVersion={2}
        labels={labels}
        status="in_progress"
        taskId="task-1"
      />
    );

    expect(screen.queryByTestId('agent-crm-task-queue-start')).toBeNull();
    expect(screen.getByTestId('agent-crm-task-queue-complete')).toHaveTextContent('Complete');
    expect(screen.getByTestId('agent-crm-task-queue-due-edit')).toHaveTextContent('Edit due date');
  });

  it('submits the current task id and lifecycle version without optimistic row mutation', async () => {
    render(
      <TaskQueueControls
        expectedLifecycleVersion={7}
        labels={labels}
        status="pending"
        taskId="task-7"
      />
    );

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

    render(
      <TaskQueueControls
        expectedLifecycleVersion={7}
        labels={labels}
        status="in_progress"
        taskId="task-7"
      />
    );

    fireEvent.click(screen.getByTestId('agent-crm-task-queue-complete'));

    await waitFor(() => {
      expect(screen.getByText('Changed')).toBeTruthy();
    });
    expect(hoisted.refreshMock).not.toHaveBeenCalled();
    expect(screen.queryByText('lifecycle_conflict')).toBeNull();
  });

  it('restores the row after unexpected submission failures', async () => {
    hoisted.lifecycleSubmitMock.mockRejectedValueOnce(new Error('network unavailable'));

    render(
      <TaskQueueControls
        expectedLifecycleVersion={7}
        labels={labels}
        status="pending"
        taskId="task-7"
      />
    );

    fireEvent.click(screen.getByTestId('agent-crm-task-queue-start'));

    await waitFor(() => {
      expect(screen.getByText('Try again')).toBeTruthy();
    });
    expect(screen.getByTestId('agent-crm-task-queue-start')).not.toBeDisabled();
    expect(hoisted.refreshMock).not.toHaveBeenCalled();
  });

  it('submits a normalized due-date update without optimistic row mutation', async () => {
    render(
      <TaskQueueControls
        expectedLifecycleVersion={8}
        labels={labels}
        status="pending"
        taskId="task-8"
      />
    );

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
  });

  it('clears the due date through the row-local due-date control', async () => {
    hoisted.dueDateSubmitMock.mockResolvedValueOnce({ dueAt: null, success: true });

    render(
      <TaskQueueControls
        expectedLifecycleVersion={8}
        labels={labels}
        status="pending"
        taskId="task-8"
      />
    );

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

  it('renders server-side invalid-date failures as stable row-local copy', async () => {
    hoisted.dueDateSubmitMock.mockResolvedValueOnce({
      error: 'invalid_date',
      success: false,
    });

    render(
      <TaskQueueControls
        expectedLifecycleVersion={8}
        labels={labels}
        status="pending"
        taskId="task-8"
      />
    );

    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-edit'));
    fireEvent.change(screen.getByTestId('agent-crm-task-queue-due-input'), {
      target: { value: '2026-05-22T12:30' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-save'));

    await waitFor(() => {
      expect(screen.getByText('Invalid date')).toBeTruthy();
    });
    expect(hoisted.refreshMock).not.toHaveBeenCalled();
  });

  it('keeps due-date failures row-local and displays only stable UI copy', async () => {
    hoisted.dueDateSubmitMock.mockResolvedValueOnce({
      error: 'conflict',
      success: false,
    });

    render(
      <TaskQueueControls
        expectedLifecycleVersion={8}
        labels={labels}
        status="pending"
        taskId="task-8"
      />
    );

    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-edit'));
    fireEvent.click(screen.getByTestId('agent-crm-task-queue-due-save'));

    await waitFor(() => {
      expect(screen.getByText('Due date changed')).toBeTruthy();
    });
    expect(screen.queryByText('lifecycle_conflict')).toBeNull();
    expect(hoisted.refreshMock).not.toHaveBeenCalled();
  });
});
