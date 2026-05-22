'use client';

import { Check, Play } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState, useTransition } from 'react';

import {
  submitAgentCrmTaskQueueLifecycleAction,
  type AgentCrmTaskQueueLifecycleInput,
} from './task-queue-actions';
import { TaskQueueCancelControls } from './task-queue-cancel-controls';
import { TaskQueueDueDateControls } from './task-queue-due-date-controls';
import { TaskQueueIconButton } from './task-queue-icon-button';

type TaskQueueControlsStatus = 'pending' | 'in_progress';
type TaskQueueLifecycleAction = AgentCrmTaskQueueLifecycleInput['action'];
export function TaskQueueControls({
  expectedLifecycleVersion,
  rowLabel,
  status,
  taskId,
}: Readonly<{
  expectedLifecycleVersion: number;
  rowLabel: string;
  status: TaskQueueControlsStatus;
  taskId: string;
}>) {
  const router = useRouter();
  const t = useTranslations('agent-crm.crm.taskQueue.actions');
  const messageId = useId();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<TaskQueueLifecycleAction | null>(null);
  const [isCancelPending, setIsCancelPending] = useState(false);
  const [isDuePending, setIsDuePending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const completeButtonRef = useRef<HTMLButtonElement | null>(null);

  function lifecycleLabel(action: TaskQueueLifecycleAction, activeKey: 'active' | 'idle') {
    if (action === 'start') {
      return t(activeKey === 'active' ? 'starting' : 'start');
    }

    return t(activeKey === 'active' ? 'completing' : 'complete');
  }

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
          setMessage(t(`success.${action}`));
          focusAfterSuccess(action);
          router.refresh();
          setActiveAction(null);
          return;
        }

        setMessage(t(`error.${result.error}`));
      } catch {
        setMessage(t('error.transient'));
      } finally {
        setActiveAction(null);
      }
    });
  }

  const pendingLabel = activeAction ? lifecycleLabel(activeAction, 'active') : '';
  const isSubmitting = isPending || activeAction !== null;
  const rowDisabled = isSubmitting || isDuePending || isCancelPending;

  return (
    <div
      className="flex flex-col items-stretch gap-2 sm:items-end"
      role="group"
      aria-label={t('group')}
    >
      <div className="flex flex-wrap justify-end gap-2">
        {status === 'pending' ? (
          <TaskQueueIconButton
            ref={startButtonRef}
            disabled={rowDisabled}
            onClick={() => submit('start')}
            icon={<Play className="h-4 w-4" aria-hidden="true" />}
            testId="agent-crm-task-queue-start"
          >
            {lifecycleLabel('start', activeAction === 'start' ? 'active' : 'idle')}
          </TaskQueueIconButton>
        ) : null}
        <TaskQueueIconButton
          ref={completeButtonRef}
          disabled={rowDisabled}
          onClick={() => submit('complete')}
          icon={<Check className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-queue-complete"
        >
          {lifecycleLabel('complete', activeAction === 'complete' ? 'active' : 'idle')}
        </TaskQueueIconButton>
      </div>
      <TaskQueueDueDateControls
        disabled={isSubmitting || isCancelPending}
        expectedLifecycleVersion={expectedLifecycleVersion}
        onMessage={setMessage}
        onPendingChange={setIsDuePending}
        rowMessageId={messageId}
        taskId={taskId}
      />
      <TaskQueueCancelControls
        disabled={isSubmitting || isDuePending}
        expectedLifecycleVersion={expectedLifecycleVersion}
        onMessage={setMessage}
        onPendingChange={setIsCancelPending}
        rowLabel={rowLabel}
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
