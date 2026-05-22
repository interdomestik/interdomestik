'use client';

import { CalendarClock, Eraser, Save, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import { submitAgentCrmTaskQueueDueDateAction } from './task-queue-actions';
import { TaskQueueIconButton } from './task-queue-icon-button';

type TaskQueueDueDatePendingAction = 'due_save' | 'due_clear';

function parseDueDateInput(value: string): string | 'invalid' {
  const timestamp = Date.parse(value.trim());
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : 'invalid';
}

function focusQueued(getElement: () => HTMLElement | null) {
  window.requestAnimationFrame(() => {
    getElement()?.focus();
  });
}

export function TaskQueueDueDateControls({
  disabled,
  expectedLifecycleVersion,
  onMessage,
  onPendingChange,
  rowMessageId,
  taskId,
}: Readonly<{
  disabled: boolean;
  expectedLifecycleVersion: number;
  onMessage: (message: string | null) => void;
  onPendingChange: (isPending: boolean) => void;
  rowMessageId: string;
  taskId: string;
}>) {
  const router = useRouter();
  const t = useTranslations('agent-crm.crm.taskQueue.dueActions');
  const dueInputId = useId();
  const [activeAction, setActiveAction] = useState<TaskQueueDueDatePendingAction | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dueValue, setDueValue] = useState('');
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isSubmitting = disabled || activeAction !== null;
  const canSaveDueDate = dueValue.trim().length > 0;

  function openEditor() {
    setDueValue('');
    setIsEditing(true);
    setHasError(false);
    onMessage(null);
    focusQueued(() => inputRef.current);
  }

  function closeEditor() {
    setDueValue('');
    setIsEditing(false);
    setHasError(false);
    onMessage(null);
    focusQueued(() => editButtonRef.current);
  }

  function submitDueDate(action: TaskQueueDueDatePendingAction) {
    const dueAtValue = action === 'due_clear' ? null : parseDueDateInput(dueValue);
    if (dueAtValue === 'invalid') {
      setHasError(true);
      onMessage(t('error.invalid_date'));
      inputRef.current?.focus();
      return;
    }

    setHasError(false);
    setActiveAction(action);
    onPendingChange(true);
    onMessage(action === 'due_clear' ? t('clearing') : t('saving'));
    void (async () => {
      try {
        const result = await submitAgentCrmTaskQueueDueDateAction({
          dueAt: dueAtValue,
          expectedLifecycleVersion,
          taskId,
        });

        if (result.success) {
          setHasError(false);
          onMessage(t(result.dueAt === null ? 'success.clear' : 'success.set'));
          onPendingChange(false);
          setActiveAction(null);
          setIsEditing(false);
          focusQueued(() => editButtonRef.current);
          router.refresh();
          return;
        }

        setHasError(true);
        onMessage(t(`error.${result.error}`));
      } catch {
        setHasError(true);
        onMessage(t('error.transient'));
      } finally {
        onPendingChange(false);
        setActiveAction(null);
      }
    })();
  }

  if (!isEditing) {
    return (
      <span className="inline-flex justify-end" role="group" aria-label={t('group')}>
        <TaskQueueIconButton
          ref={editButtonRef}
          disabled={isSubmitting}
          onClick={openEditor}
          icon={<CalendarClock className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-queue-due-edit"
        >
          {t('edit')}
        </TaskQueueIconButton>
      </span>
    );
  }

  return (
    <div className="grid justify-items-end gap-2 text-sm" role="group" aria-label={t('group')}>
      <label className="sr-only" htmlFor={dueInputId}>
        {t('field')}
      </label>
      <input
        ref={inputRef}
        id={dueInputId}
        type="datetime-local"
        step={1}
        value={dueValue}
        disabled={isSubmitting}
        aria-describedby={rowMessageId}
        aria-invalid={hasError ? true : undefined}
        onChange={event => setDueValue(event.target.value)}
        className="min-h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="agent-crm-task-queue-due-input"
      />
      <div className="flex flex-wrap justify-end gap-2">
        <TaskQueueIconButton
          disabled={isSubmitting || !canSaveDueDate}
          onClick={() => submitDueDate('due_save')}
          icon={<Save className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-queue-due-save"
        >
          {activeAction === 'due_save' ? t('saving') : t('save')}
        </TaskQueueIconButton>
        <TaskQueueIconButton
          disabled={isSubmitting}
          onClick={() => submitDueDate('due_clear')}
          icon={<Eraser className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-queue-due-clear"
        >
          {activeAction === 'due_clear' ? t('clearing') : t('clear')}
        </TaskQueueIconButton>
        <TaskQueueIconButton
          variant="ghost"
          disabled={isSubmitting}
          onClick={closeEditor}
          icon={<X className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-queue-due-cancel"
        >
          {t('cancel')}
        </TaskQueueIconButton>
      </div>
    </div>
  );
}
