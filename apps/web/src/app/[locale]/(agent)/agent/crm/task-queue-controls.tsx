'use client';

import { Check, MoreHorizontal, Play, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import {
  Fragment,
  type KeyboardEvent,
  useEffect,
  useId,
  useRef,
  useState,
  useTransition,
} from 'react';

import {
  submitAgentCrmTaskQueueLifecycleAction,
  type AgentCrmTaskQueueLifecycleInput,
} from './task-queue-actions';
import { TaskQueueCancelControls } from './task-queue-cancel-controls';
import { TaskQueueDueDateControls } from './task-queue-due-date-controls';
import { TaskQueueIconButton } from './task-queue-icon-button';
import { TaskQueuePriorityControls } from './task-queue-priority-controls';
import type { AgentCrmTaskQueuePriority } from './task-queue-priorities';

type TaskQueueControlsStatus = 'pending' | 'in_progress';
type TaskQueueLifecycleAction = AgentCrmTaskQueueLifecycleInput['action'];

function focusQueued(getElement: () => HTMLElement | null) {
  globalThis.requestAnimationFrame(() => {
    getElement()?.focus();
  });
}

export function TaskQueueControls({
  expectedLifecycleVersion,
  priority,
  rowLabel,
  status,
  taskId,
}: Readonly<{
  expectedLifecycleVersion: number;
  priority: AgentCrmTaskQueuePriority;
  rowLabel: string;
  status: TaskQueueControlsStatus;
  taskId: string;
}>) {
  const router = useRouter();
  const t = useTranslations('agent-crm.crm.taskQueue.actions');
  const tSecondary = useTranslations('agent-crm.crm.taskQueue.secondaryActions');
  const messageId = useId();
  const secondaryPanelId = useId();
  const [isPending, startTransition] = useTransition();
  const [activeAction, setActiveAction] = useState<TaskQueueLifecycleAction | null>(null);
  const [isSecondaryOpen, setIsSecondaryOpen] = useState(false);
  const [isCancelConfirming, setIsCancelConfirming] = useState(false);
  const [isCancelPending, setIsCancelPending] = useState(false);
  const [isDuePending, setIsDuePending] = useState(false);
  const [isPriorityPending, setIsPriorityPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const startButtonRef = useRef<HTMLButtonElement | null>(null);
  const completeButtonRef = useRef<HTMLButtonElement | null>(null);
  const secondaryTriggerRef = useRef<HTMLButtonElement | null>(null);
  const secondaryPanelRef = useRef<HTMLDivElement | null>(null);
  const shouldFocusSecondaryPanelRef = useRef(false);

  function lifecycleLabel(action: TaskQueueLifecycleAction, activeKey: 'active' | 'idle') {
    if (action === 'start') {
      return t(activeKey === 'active' ? 'starting' : 'start');
    }

    return t(activeKey === 'active' ? 'completing' : 'complete');
  }

  function focusAfterSuccess(action: TaskQueueLifecycleAction) {
    const heading = document.querySelector<HTMLElement>(
      '[data-testid="agent-crm-task-queue-title"]'
    );

    focusQueued(() => (action === 'start' ? secondaryTriggerRef.current : heading));
  }

  function focusFirstSecondaryControl() {
    focusQueued(
      () =>
        secondaryPanelRef.current?.querySelector<HTMLElement>(
          'button:not([disabled]), select:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])'
        ) ?? null
    );
  }

  function openSecondaryActions() {
    shouldFocusSecondaryPanelRef.current = true;
    setIsSecondaryOpen(true);
    setMessage(null);
  }

  function closeSecondaryActions() {
    setIsSecondaryOpen(false);
    setIsCancelConfirming(false);
    setMessage(null);
    focusQueued(() => secondaryTriggerRef.current);
  }

  function closeSecondaryActionsAfterSuccess() {
    setIsSecondaryOpen(false);
    setIsCancelConfirming(false);
    focusQueued(() => secondaryTriggerRef.current);
  }

  function handleSecondaryKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== 'Escape') {
      return;
    }

    event.preventDefault();
    closeSecondaryActions();
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
          setIsSecondaryOpen(false);
          setIsCancelConfirming(false);
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
  const rowDisabled = isSubmitting || isDuePending || isCancelPending || isPriorityPending;
  const dueDisabled = isSubmitting || isCancelPending || isPriorityPending || isCancelConfirming;
  const priorityDisabled = isSubmitting || isCancelPending || isDuePending || isCancelConfirming;
  const cancelDisabled = isSubmitting || isDuePending || isPriorityPending;

  useEffect(() => {
    if (!isSecondaryOpen || !shouldFocusSecondaryPanelRef.current) {
      return;
    }

    shouldFocusSecondaryPanelRef.current = false;
    focusFirstSecondaryControl();
  }, [isSecondaryOpen]);

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
        <TaskQueueIconButton
          ref={secondaryTriggerRef}
          ariaControls={secondaryPanelId}
          ariaExpanded={isSecondaryOpen}
          ariaLabel={tSecondary(isSecondaryOpen ? 'closeFor' : 'openFor', { label: rowLabel })}
          disabled={rowDisabled}
          onClick={isSecondaryOpen ? closeSecondaryActions : openSecondaryActions}
          icon={<MoreHorizontal className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-queue-secondary-toggle"
        >
          {tSecondary(isSecondaryOpen ? 'close' : 'open')}
        </TaskQueueIconButton>
      </div>
      {isSecondaryOpen ? (
        <div
          ref={secondaryPanelRef}
          id={secondaryPanelId}
          className="grid justify-items-end gap-2 rounded-md border border-border/70 bg-muted/30 p-2"
          role="group"
          aria-label={tSecondary('groupFor', { label: rowLabel })}
          onKeyDown={handleSecondaryKeyDown}
          data-testid="agent-crm-task-queue-secondary-panel"
        >
          <Fragment key={isCancelConfirming ? 'cancel-confirming' : 'secondary-editing'}>
            <TaskQueueDueDateControls
              disabled={dueDisabled}
              expectedLifecycleVersion={expectedLifecycleVersion}
              onMessage={setMessage}
              onPendingChange={setIsDuePending}
              onSuccess={closeSecondaryActionsAfterSuccess}
              rowMessageId={messageId}
              taskId={taskId}
            />
            <TaskQueuePriorityControls
              currentPriority={priority}
              disabled={priorityDisabled}
              expectedLifecycleVersion={expectedLifecycleVersion}
              onMessage={setMessage}
              onPendingChange={setIsPriorityPending}
              onSuccess={closeSecondaryActionsAfterSuccess}
              rowLabel={rowLabel}
              rowMessageId={messageId}
              taskId={taskId}
            />
          </Fragment>
          <TaskQueueCancelControls
            disabled={cancelDisabled}
            expectedLifecycleVersion={expectedLifecycleVersion}
            onConfirmingChange={setIsCancelConfirming}
            onMessage={setMessage}
            onPendingChange={setIsCancelPending}
            rowLabel={rowLabel}
            rowMessageId={messageId}
            taskId={taskId}
          />
          <TaskQueueIconButton
            ariaLabel={tSecondary('closeFor', { label: rowLabel })}
            disabled={false}
            variant="ghost"
            onClick={closeSecondaryActions}
            icon={<X className="h-4 w-4" aria-hidden="true" />}
            testId="agent-crm-task-queue-secondary-close"
          >
            {tSecondary('close')}
          </TaskQueueIconButton>
        </div>
      ) : null}
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
