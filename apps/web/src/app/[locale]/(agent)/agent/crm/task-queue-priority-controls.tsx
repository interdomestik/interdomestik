'use client';

import { Save } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { submitAgentCrmTaskQueuePriorityAction } from './task-queue-actions';
import {
  AGENT_CRM_TASK_QUEUE_PRIORITIES,
  type AgentCrmTaskQueuePriority,
} from './task-queue-priorities';
import { TaskQueueIconButton } from './task-queue-icon-button';

function focusQueued(getElement: () => HTMLElement | null) {
  globalThis.requestAnimationFrame(() => {
    getElement()?.focus();
  });
}

export function TaskQueuePriorityControls({
  currentPriority,
  disabled,
  expectedLifecycleVersion,
  onMessage,
  onPendingChange,
  rowLabel,
  rowMessageId,
  taskId,
}: Readonly<{
  currentPriority: AgentCrmTaskQueuePriority;
  disabled: boolean;
  expectedLifecycleVersion: number;
  onMessage: (message: string | null) => void;
  onPendingChange: (isPending: boolean) => void;
  rowLabel: string;
  rowMessageId: string;
  taskId: string;
}>) {
  const router = useRouter();
  const t = useTranslations('agent-crm.crm.taskQueue');
  const selectId = useId();
  const selectRef = useRef<HTMLSelectElement | null>(null);
  const [selectedPriority, setSelectedPriority] =
    useState<AgentCrmTaskQueuePriority>(currentPriority);
  const [isSaving, setIsSaving] = useState(false);
  const [hasError, setHasError] = useState(false);
  const isSubmitting = disabled || isSaving;
  const canSave = selectedPriority !== currentPriority;

  useEffect(() => {
    setSelectedPriority(currentPriority);
  }, [currentPriority]);

  function submitPriority() {
    if (!canSave || isSubmitting) {
      return;
    }

    setHasError(false);
    setIsSaving(true);
    onPendingChange(true);
    onMessage(t('priorityActions.saving'));
    void (async () => {
      try {
        const result = await submitAgentCrmTaskQueuePriorityAction({
          expectedLifecycleVersion,
          priority: selectedPriority,
          taskId,
        });

        if (result.success) {
          onMessage(t('priorityActions.success'));
          onPendingChange(false);
          setIsSaving(false);
          focusQueued(() => selectRef.current);
          router.refresh();
          return;
        }

        setHasError(true);
        onMessage(t(`priorityActions.error.${result.error}`));
      } catch {
        setHasError(true);
        onMessage(t('priorityActions.error.transient'));
      } finally {
        onPendingChange(false);
        setIsSaving(false);
      }
    })();
  }

  return (
    <fieldset
      className="grid justify-items-end gap-2 text-sm"
      data-testid="agent-crm-task-queue-priority"
    >
      <legend className="sr-only">{t('priorityActions.groupFor', { label: rowLabel })}</legend>
      <label className="sr-only" htmlFor={selectId}>
        {t('priorityActions.fieldFor', { label: rowLabel })}
      </label>
      <div className="flex flex-wrap justify-end gap-2">
        <select
          ref={selectRef}
          id={selectId}
          value={selectedPriority}
          disabled={isSubmitting}
          aria-describedby={rowMessageId}
          aria-invalid={hasError ? true : undefined}
          onChange={event => {
            setHasError(false);
            setSelectedPriority(event.target.value as AgentCrmTaskQueuePriority);
            onMessage(null);
          }}
          className="min-h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          data-testid="agent-crm-task-queue-priority-select"
        >
          {AGENT_CRM_TASK_QUEUE_PRIORITIES.map(priority => (
            <option key={priority} value={priority}>
              {t(`priority.${priority}`)}
            </option>
          ))}
        </select>
        <TaskQueueIconButton
          ariaLabel={t('priorityActions.saveFor', { label: rowLabel })}
          disabled={isSubmitting || !canSave}
          onClick={submitPriority}
          icon={<Save className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-queue-priority-save"
        >
          {isSaving ? t('priorityActions.saving') : t('priorityActions.save')}
        </TaskQueueIconButton>
      </div>
    </fieldset>
  );
}
