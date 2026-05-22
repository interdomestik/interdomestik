'use client';

import { Button } from '@interdomestik/ui';
import { Check, Play } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';

import {
  submitAgentCrmTaskQueueLifecycleAction,
  type AgentCrmTaskQueueLifecycleInput,
} from './task-queue-actions';
import {
  TaskQueueDueDateControls,
  type TaskQueueDueDateControlsLabels,
} from './task-queue-due-date-controls';

type TaskQueueControlsStatus = 'pending' | 'in_progress';
type TaskQueueLifecycleAction = AgentCrmTaskQueueLifecycleInput['action'];
type TaskQueueLifecycleError = 'unavailable' | 'conflict' | 'rate_limited' | 'transient';

export type TaskQueueControlsLabels = {
  readonly complete: string;
  readonly completing: string;
  readonly due: TaskQueueDueDateControlsLabels;
  readonly error: Record<TaskQueueLifecycleError, string>;
  readonly group: string;
  readonly start: string;
  readonly starting: string;
  readonly success: Record<TaskQueueLifecycleAction, string>;
};

export function TaskQueueControls({
  expectedLifecycleVersion,
  labels,
  status,
  taskId,
}: Readonly<{
  expectedLifecycleVersion: number;
  labels: TaskQueueControlsLabels;
  status: TaskQueueControlsStatus;
  taskId: string;
}>) {
  const router = useRouter();
  const messageId = useId();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<TaskQueueLifecycleAction | null>(null);
  const [isDuePending, setIsDuePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const completeButtonRef = useRef<HTMLButtonElement | null>(null);

  function focusAfterSuccess(action: TaskQueueLifecycleAction) {
    const button = action === 'start' ? startButtonRef.current : completeButtonRef.current;
    const row = button?.closest('[data-testid="agent-crm-task-queue-row"]');
    const nextRow = row?.nextElementSibling?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const heading = document.querySelector<HTMLElement>(
      '[data-testid="agent-crm-task-queue-title"]'
    );

    window.requestAnimationFrame(() => {
      (nextRow ?? heading)?.focus();
    });
  }

  function submit(action: TaskQueueLifecycleAction) {
    setActiveAction(action);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await submitAgentCrmTaskQueueLifecycleAction({
          action,
          expectedLifecycleVersion,
          taskId,
        });

        if (result.success) {
          setMessage(labels.success[action]);
          focusAfterSuccess(action);
          router.refresh();
          setActiveAction(null);
          return;
        }

        setMessage(labels.error[result.error]);
      } catch {
        setMessage(labels.error.transient);
      } finally {
        setActiveAction(null);
      }
    });
  }

  const pendingLabel =
    activeAction === 'start'
      ? labels.starting
      : activeAction === 'complete'
        ? labels.completing
        : '';
  const isSubmitting = isPending || activeAction !== null;
  const rowDisabled = isSubmitting || isDuePending;

  return (
    <div
      className="flex flex-col items-stretch gap-2 sm:items-end"
      role="group"
      aria-label={labels.group}
    >
      <div className="flex flex-wrap justify-end gap-2">
        {status === 'pending' ? (
          <Button
            ref={startButtonRef}
            type="button"
            variant="outline"
            size="sm"
            disabled={rowDisabled}
            onClick={() => submit('start')}
            data-testid="agent-crm-task-queue-start"
          >
            <Play className="h-4 w-4" aria-hidden="true" />
            {activeAction === 'start' ? labels.starting : labels.start}
          </Button>
        ) : null}
        <Button
          ref={completeButtonRef}
          type="button"
          variant="outline"
          size="sm"
          disabled={rowDisabled}
          onClick={() => submit('complete')}
          data-testid="agent-crm-task-queue-complete"
        >
          <Check className="h-4 w-4" aria-hidden="true" />
          {activeAction === 'complete' ? labels.completing : labels.complete}
        </Button>
      </div>
      <TaskQueueDueDateControls
        disabled={isSubmitting}
        expectedLifecycleVersion={expectedLifecycleVersion}
        labels={labels.due}
        onMessage={setMessage}
        onPendingChange={setIsDuePending}
        rowMessageId={messageId}
        taskId={taskId}
      />
      <p
        id={messageId}
        className={message ? 'text-xs text-muted-foreground' : 'sr-only'}
        aria-live="polite"
      >
        {message ?? pendingLabel}
      </p>
    </div>
  );
}
