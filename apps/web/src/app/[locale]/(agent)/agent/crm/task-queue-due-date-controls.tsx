'use client';

import { Button } from '@interdomestik/ui';
import { CalendarClock, Eraser, Save, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import { submitAgentCrmTaskQueueDueDateAction } from './task-queue-actions';

type TaskQueueDueDateError =
  | 'unavailable'
  | 'invalid_date'
  | 'conflict'
  | 'rate_limited'
  | 'transient';
type TaskQueueDueDatePendingAction = 'due_save' | 'due_clear';

export type TaskQueueDueDateControlsLabels = {
  readonly cancel: string;
  readonly clear: string;
  readonly clearing: string;
  readonly edit: string;
  readonly error: Record<TaskQueueDueDateError, string>;
  readonly field: string;
  readonly group: string;
  readonly save: string;
  readonly saving: string;
  readonly success: {
    readonly clear: string;
    readonly set: string;
  };
};

function normalizeLocalDateTimeInput(value: string): string | null | 'invalid' {
  const trimmed = value.trim();
  if (trimmed.length === 0) return null;

  const date = new Date(trimmed);
  if (!Number.isFinite(date.getTime())) return 'invalid';

  return date.toISOString();
}

export function TaskQueueDueDateControls({
  disabled,
  expectedLifecycleVersion,
  labels,
  onMessage,
  onPendingChange,
  rowMessageId,
  taskId,
}: Readonly<{
  disabled: boolean;
  expectedLifecycleVersion: number;
  labels: TaskQueueDueDateControlsLabels;
  onMessage: (message: string | null) => void;
  onPendingChange: (isPending: boolean) => void;
  rowMessageId: string;
  taskId: string;
}>) {
  const router = useRouter();
  const dueInputId = useId();
  const [activeAction, setActiveAction] = useState<TaskQueueDueDatePendingAction | null>(null);
  const [hasError, setHasError] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [dueValue, setDueValue] = useState('');
  const editButtonRef = useRef<HTMLButtonElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const isSubmitting = disabled || activeAction !== null;

  function openEditor() {
    setDueValue('');
    setIsEditing(true);
    setHasError(false);
    onMessage(null);
    window.requestAnimationFrame(() => {
      inputRef.current?.focus();
    });
  }

  function closeEditor() {
    setDueValue('');
    setIsEditing(false);
    setHasError(false);
    onMessage(null);
    window.requestAnimationFrame(() => {
      editButtonRef.current?.focus();
    });
  }

  function submitDueDate(action: TaskQueueDueDatePendingAction) {
    const dueAtValue = action === 'due_clear' ? null : normalizeLocalDateTimeInput(dueValue);
    if (dueAtValue === 'invalid') {
      setHasError(true);
      onMessage(labels.error.invalid_date);
      inputRef.current?.focus();
      return;
    }

    setHasError(false);
    setActiveAction(action);
    onPendingChange(true);
    onMessage(action === 'due_clear' ? labels.clearing : labels.saving);
    void (async () => {
      try {
        const result = await submitAgentCrmTaskQueueDueDateAction({
          dueAt: dueAtValue,
          expectedLifecycleVersion,
          taskId,
        });

        if (result.success) {
          setHasError(false);
          onMessage(result.dueAt === null ? labels.success.clear : labels.success.set);
          onPendingChange(false);
          setActiveAction(null);
          setIsEditing(false);
          window.requestAnimationFrame(() => {
            editButtonRef.current?.focus();
          });
          router.refresh();
          return;
        }

        setHasError(true);
        onMessage(labels.error[result.error]);
      } catch {
        setHasError(true);
        onMessage(labels.error.transient);
      } finally {
        onPendingChange(false);
        setActiveAction(null);
      }
    })();
  }

  return (
    <div
      className="flex flex-col items-stretch gap-2 text-sm sm:items-end"
      role="group"
      aria-label={labels.group}
    >
      {isEditing ? (
        <>
          <label className="sr-only" htmlFor={dueInputId}>
            {labels.field}
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
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => submitDueDate('due_save')}
              data-testid="agent-crm-task-queue-due-save"
            >
              <Save className="h-4 w-4" aria-hidden="true" />
              {activeAction === 'due_save' ? labels.saving : labels.save}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isSubmitting}
              onClick={() => submitDueDate('due_clear')}
              data-testid="agent-crm-task-queue-due-clear"
            >
              <Eraser className="h-4 w-4" aria-hidden="true" />
              {activeAction === 'due_clear' ? labels.clearing : labels.clear}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={isSubmitting}
              onClick={closeEditor}
              data-testid="agent-crm-task-queue-due-cancel"
            >
              <X className="h-4 w-4" aria-hidden="true" />
              {labels.cancel}
            </Button>
          </div>
        </>
      ) : (
        <Button
          ref={editButtonRef}
          type="button"
          variant="outline"
          size="sm"
          disabled={isSubmitting}
          onClick={openEditor}
          data-testid="agent-crm-task-queue-due-edit"
        >
          <CalendarClock className="h-4 w-4" aria-hidden="true" />
          {labels.edit}
        </Button>
      )}
    </div>
  );
}
