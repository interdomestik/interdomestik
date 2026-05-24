'use client';

import { Ban } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { submitAgentCrmTaskQueueCancellationAction } from './task-queue-actions';
import {
  AGENT_CRM_TASK_QUEUE_CANCELLATION_REASON_CODES,
  type AgentCrmTaskQueueCancellationReasonCode,
} from './task-queue-cancellation-reasons';
import { TaskQueueIconButton } from './task-queue-icon-button';
import { TaskQueueReasonConfirmation } from './task-queue-reason-confirmation';

function focusQueued(getElement: () => HTMLElement | null) {
  globalThis.requestAnimationFrame(() => {
    getElement()?.focus();
  });
}

export function TaskQueueCancelControls({
  disabled,
  expectedLifecycleVersion,
  onMessage,
  onConfirmingChange,
  onPendingChange,
  rowMessageId,
  rowLabel,
  taskId,
}: Readonly<{
  disabled: boolean;
  expectedLifecycleVersion: number;
  onMessage: (message: string | null) => void;
  onConfirmingChange?: (isConfirming: boolean) => void;
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

  useEffect(() => {
    return () => {
      onConfirmingChange?.(false);
    };
  }, [onConfirmingChange]);

  function openConfirmation() {
    setHasError(false);
    setIsConfirming(true);
    onConfirmingChange?.(true);
    setReasonCode('');
    onMessage(null);
    focusQueued(() => reasonSelectRef.current);
  }

  function dismissConfirmation() {
    setHasError(false);
    setIsConfirming(false);
    onConfirmingChange?.(false);
    setReasonCode('');
    onMessage(null);
    focusQueued(() => cancelButtonRef.current);
  }

  function focusAfterSuccess() {
    const heading = document.querySelector<HTMLElement>(
      '[data-testid="agent-crm-task-queue-title"]'
    );

    focusQueued(() => heading);
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
          onConfirmingChange?.(false);
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
      <fieldset className="m-0 inline-flex min-w-0 justify-end border-0 p-0">
        <legend className="sr-only">{t('groupFor', { label: rowLabel })}</legend>
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
      </fieldset>
    );
  }

  return (
    <TaskQueueReasonConfirmation
      confirmButtonRef={confirmButtonRef}
      confirmLabel={t('confirm')}
      confirmingLabel={t('confirming')}
      disabled={isDisabled}
      dismissLabel={t('dismiss')}
      fieldLabel={t('field')}
      groupLabel={t('confirmGroupFor', { label: rowLabel })}
      hasError={hasError}
      isSubmitting={isSubmitting}
      messageId={rowMessageId}
      onDismiss={dismissConfirmation}
      onReasonChange={setReasonCode}
      onSubmit={submitCancellation}
      placeholder={t('placeholder')}
      reasonCode={reasonCode}
      reasonLabel={reason => t(`reasons.${reason}`)}
      reasonSelectId={reasonSelectId}
      reasonSelectRef={reasonSelectRef}
      reasons={AGENT_CRM_TASK_QUEUE_CANCELLATION_REASON_CODES}
      testIds={{
        confirm: 'agent-crm-task-queue-cancel-confirm',
        dismiss: 'agent-crm-task-queue-cancel-dismiss',
        select: 'agent-crm-task-queue-cancel-reason',
      }}
    />
  );
}
