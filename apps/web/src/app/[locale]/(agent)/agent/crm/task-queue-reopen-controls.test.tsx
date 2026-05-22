import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const hoisted = vi.hoisted(() => ({
  refreshMock: vi.fn(),
  reopenSubmitMock: vi.fn(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    refresh: hoisted.refreshMock,
  }),
}));

const translations: Record<string, string> = {
  confirm: 'Reopen',
  confirmGroupFor: 'Confirm reopening for {label}',
  confirming: 'Reopening...',
  dismiss: 'Keep completed',
  'error.conflict': 'Task changed before reopen',
  'error.invalid_reason': 'Select a reopen reason',
  'error.rate_limited': 'Wait to reopen',
  'error.terminal': 'Task changed before reopen',
  'error.transient': 'Try reopen again',
  'error.unavailable': 'Reopen unavailable',
  field: 'Reopen reason',
  groupFor: 'Task reopen actions for {label}',
  open: 'Reopen task',
  openFor: 'Reopen task for {label}',
  placeholder: 'Select reason',
  'reasons.follow_up_required': 'Follow-up required',
  'reasons.incomplete': 'Task incomplete',
  'reasons.manually_reopened': 'Manual reopen',
  success: 'Task reopened',
};

vi.mock('next-intl', () => ({
  useTranslations: () => (key: string, values?: Record<string, string>) => {
    let message = translations[key] ?? key;
    for (const [name, value] of Object.entries(values ?? {})) {
      message = message.replaceAll(`{${name}}`, value);
    }
    return message;
  },
}));

vi.mock('./task-queue-actions', () => ({
  submitAgentCrmTaskQueueReopenAction: hoisted.reopenSubmitMock,
}));

import { TaskQueueReopenControls } from './task-queue-reopen-controls';

function renderControls() {
  return render(
    <div>
      <h2 data-testid="agent-crm-task-completed-queue-title" tabIndex={-1}>
        Recently completed
      </h2>
      <div data-testid="agent-crm-task-completed-queue-row">
        <button type="button">Lead One</button>
        <TaskQueueReopenControls expectedLifecycleVersion={7} rowLabel="Lead One" taskId="task-7" />
      </div>
      <div data-testid="agent-crm-task-completed-queue-row">
        <button type="button">Lead Two</button>
      </div>
    </div>
  );
}

describe('TaskQueueReopenControls', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    hoisted.reopenSubmitMock.mockResolvedValue({
      reasonCode: 'follow_up_required',
      success: true,
    });
    vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
      callback(0);
      return 0;
    });
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders a row-local reopen affordance with task context', () => {
    renderControls();

    expect(screen.getByTestId('agent-crm-task-completed-queue-reopen')).toHaveAccessibleName(
      'Reopen task for Lead One'
    );
    expect(screen.getByRole('group', { name: 'Task reopen actions for Lead One' })).toBeTruthy();
  });

  it('requires selecting a reopen reason before confirmation is enabled', () => {
    renderControls();

    fireEvent.click(screen.getByTestId('agent-crm-task-completed-queue-reopen'));

    expect(screen.getByRole('group', { name: 'Confirm reopening for Lead One' })).toBeTruthy();
    expect(screen.getByTestId('agent-crm-task-completed-queue-reopen-reason')).toHaveTextContent(
      'Follow-up required'
    );
    expect(screen.getByTestId('agent-crm-task-completed-queue-reopen-reason')).toHaveTextContent(
      'Task incomplete'
    );
    expect(screen.getByTestId('agent-crm-task-completed-queue-reopen-reason')).toHaveTextContent(
      'Manual reopen'
    );
    expect(
      screen.getByTestId('agent-crm-task-completed-queue-reopen-reason')
    ).not.toHaveTextContent('duplicate');
    expect(screen.getByTestId('agent-crm-task-completed-queue-reopen-confirm')).toBeDisabled();
    expect(hoisted.reopenSubmitMock).not.toHaveBeenCalled();
  });

  it('dismisses confirmation back to the row-local reopen control', async () => {
    renderControls();

    fireEvent.click(screen.getByTestId('agent-crm-task-completed-queue-reopen'));
    fireEvent.click(screen.getByTestId('agent-crm-task-completed-queue-reopen-dismiss'));

    expect(screen.queryByTestId('agent-crm-task-completed-queue-reopen-reason')).toBeNull();
    await waitFor(() => {
      expect(screen.getByTestId('agent-crm-task-completed-queue-reopen')).toHaveFocus();
    });
    expect(hoisted.reopenSubmitMock).not.toHaveBeenCalled();
  });

  it('submits selected reason with task id and lifecycle version, then refreshes', async () => {
    renderControls();

    fireEvent.click(screen.getByTestId('agent-crm-task-completed-queue-reopen'));
    fireEvent.change(screen.getByTestId('agent-crm-task-completed-queue-reopen-reason'), {
      target: { value: 'incomplete' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-completed-queue-reopen-confirm'));

    await waitFor(() => {
      expect(hoisted.reopenSubmitMock).toHaveBeenCalledWith({
        expectedLifecycleVersion: 7,
        reasonCode: 'incomplete',
        taskId: 'task-7',
      });
    });
    expect(hoisted.refreshMock).toHaveBeenCalled();
    expect(screen.getByText('Task reopened')).toBeTruthy();
    expect(screen.queryByTestId('agent-crm-task-completed-queue-reopen-reason')).toBeNull();
  });

  it.each([
    ['conflict', 'Task changed before reopen', 'lifecycle_conflict'],
    ['terminal', 'Task changed before reopen', 'terminal_state'],
    ['rate_limited', 'Wait to reopen', 'rate_limited'],
    ['transient', 'Try reopen again', 'repository_failure'],
  ] as const)('keeps %s failures row-local and PII-safe', async (error, text, leakedText) => {
    hoisted.reopenSubmitMock.mockResolvedValueOnce({ error, success: false });

    renderControls();

    fireEvent.click(screen.getByTestId('agent-crm-task-completed-queue-reopen'));
    fireEvent.change(screen.getByTestId('agent-crm-task-completed-queue-reopen-reason'), {
      target: { value: 'manually_reopened' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-completed-queue-reopen-confirm'));

    await waitFor(() => {
      expect(screen.getByText(text)).toBeTruthy();
    });
    expect(screen.queryByText(leakedText)).toBeNull();
    expect(hoisted.refreshMock).not.toHaveBeenCalled();
  });

  it('disables duplicate submits for the same completed row while pending', async () => {
    let resolveReopen: (value: {
      readonly reasonCode: 'incomplete';
      readonly success: true;
    }) => void = () => {};
    hoisted.reopenSubmitMock.mockImplementationOnce(
      () =>
        new Promise(resolve => {
          resolveReopen = resolve;
        })
    );

    renderControls();

    fireEvent.click(screen.getByTestId('agent-crm-task-completed-queue-reopen'));
    fireEvent.change(screen.getByTestId('agent-crm-task-completed-queue-reopen-reason'), {
      target: { value: 'incomplete' },
    });
    fireEvent.click(screen.getByTestId('agent-crm-task-completed-queue-reopen-confirm'));

    await waitFor(() => {
      expect(screen.getByTestId('agent-crm-task-completed-queue-reopen-confirm')).toBeDisabled();
    });
    expect(screen.getByTestId('agent-crm-task-completed-queue-reopen-dismiss')).toBeDisabled();

    resolveReopen({ reasonCode: 'incomplete', success: true });
    await waitFor(() => {
      expect(hoisted.refreshMock).toHaveBeenCalled();
    });
  });
});
