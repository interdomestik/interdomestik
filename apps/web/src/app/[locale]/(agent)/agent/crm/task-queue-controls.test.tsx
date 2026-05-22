import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  submitMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: hoisted.refreshMock,
  }),
}));

vi.mock('./task-queue-actions', () => ({
  submitAgentCrmTaskQueueLifecycleAction: hoisted.submitMock,
}));

import { TaskQueueControls, type TaskQueueControlsLabels } from './task-queue-controls';

const labels: TaskQueueControlsLabels = {
  complete: 'Complete',
  completing: 'Completing...',
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
    hoisted.submitMock.mockResolvedValue({ action: 'start', success: true });
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
    expect(screen.getByRole('group', { name: 'Task actions' })).toBeTruthy();
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
      expect(hoisted.submitMock).toHaveBeenCalledWith({
        action: 'start',
        expectedLifecycleVersion: 7,
        taskId: 'task-7',
      });
    });
    expect(hoisted.refreshMock).toHaveBeenCalled();
    expect(screen.getByText('Started')).toBeTruthy();
  });

  it('keeps failures row-local and displays only stable UI copy', async () => {
    hoisted.submitMock.mockResolvedValueOnce({
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
    hoisted.submitMock.mockRejectedValueOnce(new Error('network unavailable'));

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
});
