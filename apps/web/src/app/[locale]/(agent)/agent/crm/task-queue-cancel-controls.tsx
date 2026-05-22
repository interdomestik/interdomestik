'use client';

import { Ban, Check, X } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useId, useRef, useState } from 'react';

import { submitAgentCrmTaskQueueCancellationAction } from './task-queue-actions';
import {
  AGENT_CRM_TASK_QUEUE_CANCELLATION_REASON_CODES,
  type AgentCrmTaskQueueCancellationReasonCode,
} from './task-queue-cancellation-reasons';
import { TaskQueueIconButton } from './task-queue-icon-button';

function focusQueued(getElement: () => HTMLElement | null) {
  globalThis.requestAnimationFrame(() => {
    getElement()?.focus();
  });
}

export function TaskQueueCancelControls({
  disabled,
  expectedLifecycleVersion,
  onMessage,
  onPendingChange,
  rowMessageId,
  rowLabel,
  taskId,
}: Readonly<{
  disabled: boolean;
  expectedLifecycleVersion: number;
  onMessage: (message: string | null) => void;
  onPendingChange: (isPending: boolean) => void;
  rowMessageId: string;
  rowLabel: string;
  taskId: string;
}>) {
  const router = useRouter();
  const t = useTranslations('agent-crm.crm.taskQueue.cancelActions');
  const reasonSelectId = useId();
  const [hasError, setHasError] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [reasonCode, setReasonCode] = useState<AgentCrmTaskQueueCancellationReasonCode | ''>('');
  const cancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const reasonSelectRef = useRef<HTMLSelectElement | null>(null);

  const isDisabled = disabled || isSubmitting;

  function openConfirmation() {
    setHasError(false);
    setIsConfirming(true);
    setReasonCode('');
    onMessage(null);
    focusQueued(() => reasonSelectRef.current);
  }

  function dismissConfirmation() {
    setHasError(false);
    setIsConfirming(false);
    setReasonCode('');
    onMessage(null);
    focusQueued(() => cancelButtonRef.current);
  }

  function focusAfterSuccess() {
    const row = confirmButtonRef.current?.closest('[data-testid="agent-crm-task-queue-row"]');
    const nextRow = row?.nextElementSibling?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const previousRow = row?.previousElementSibling?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const heading = document.querySelector<HTMLElement>(
      '[data-testid="agent-crm-task-queue-title"]'
    );

    focusQueued(() => nextRow ?? previousRow ?? heading);
  }

  function submitCancellation() {
    if (!reasonCode) {
      setHasError(true);
      onMessage(t('error.invalid_reason'));
      reasonSelectRef.current?.focus();
      return;
    }

    setHasError(false);
    setIsSubmitting(true);
    onPendingChange(true);
    onMessage(t('confirming'));
    void (async () => {
      try {
        const result = await submitAgentCrmTaskQueueCancellationAction({
          expectedLifecycleVersion,
          reasonCode,
          taskId,
        });

        if (result.success) {
          setHasError(false);
          setIsConfirming(false);
          setReasonCode('');
          onMessage(t('success'));
          onPendingChange(false);
          setIsSubmitting(false);
          focusAfterSuccess();
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
        setIsSubmitting(false);
      }
    })();
  }

  if (!isConfirming) {
    return (
      <div
        className="inline-flex justify-end"
        role="group"
        aria-label={t('groupFor', { label: rowLabel })}
      >
        <TaskQueueIconButton
          ref={cancelButtonRef}
          ariaLabel={t('openFor', { label: rowLabel })}
          disabled={isDisabled}
          onClick={openConfirmation}
          icon={<Ban className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-queue-cancel"
        >
          {t('open')}
        </TaskQueueIconButton>
      </div>
    );
  }

  return (
    <div
      className="grid justify-items-end gap-2 text-sm"
      role="group"
      aria-label={t('confirmGroupFor', { label: rowLabel })}
    >
      <label className="sr-only" htmlFor={reasonSelectId}>
        {t('field')}
      </label>
      <select
        ref={reasonSelectRef}
        id={reasonSelectId}
        value={reasonCode}
        disabled={isDisabled}
        aria-describedby={rowMessageId}
        aria-invalid={hasError ? true : undefined}
        onChange={event =>
          setReasonCode(event.target.value as AgentCrmTaskQueueCancellationReasonCode | '')
        }
        className="min-h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        data-testid="agent-crm-task-queue-cancel-reason"
      >
        <option value="">{t('placeholder')}</option>
        {AGENT_CRM_TASK_QUEUE_CANCELLATION_REASON_CODES.map(reason => (
          <option key={reason} value={reason}>
            {t(`reasons.${reason}`)}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap justify-end gap-2">
        <TaskQueueIconButton
          ref={confirmButtonRef}
          disabled={isDisabled || !reasonCode}
          onClick={submitCancellation}
          icon={<Check className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-queue-cancel-confirm"
        >
          {isSubmitting ? t('confirming') : t('confirm')}
        </TaskQueueIconButton>
        <TaskQueueIconButton
          variant="ghost"
          disabled={isDisabled}
          onClick={dismissConfirmation}
          icon={<X className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-queue-cancel-dismiss"
        >
          {t('dismiss')}
        </TaskQueueIconButton>
      </div>
    </div>
  );
}
