'use client';

import { RotateCcw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRouter } from 'next/navigation';
import { useEffect, useId, useRef, useState } from 'react';

import { submitAgentCrmTaskQueueReopenAction } from './task-queue-actions';
import {
  AGENT_CRM_TASK_QUEUE_REOPEN_REASON_CODES,
  type AgentCrmTaskQueueReopenReasonCode,
} from './task-queue-reopen-reasons';
import { TaskQueueIconButton } from './task-queue-icon-button';
import { TaskQueueReasonConfirmation } from './task-queue-reason-confirmation';

function focusQueued(getElement: () => HTMLElement | null) {
  globalThis.requestAnimationFrame(() => {
    getElement()?.focus();
  });
}

export function TaskQueueReopenControls({
  expectedLifecycleVersion,
  rowLabel,
  taskId,
}: Readonly<{
  expectedLifecycleVersion: number;
  rowLabel: string;
  taskId: string;
}>) {
  const router = useRouter();
  const t = useTranslations('agent-crm.crm.taskQueue.reopenActions');
  const messageId = useId();
  const reasonSelectId = useId();
  const [hasError, setHasError] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [reasonCode, setReasonCode] = useState<AgentCrmTaskQueueReopenReasonCode | ''>('');
  const reopenButtonRef = useRef<HTMLButtonElement | null>(null);
  const confirmButtonRef = useRef<HTMLButtonElement | null>(null);
  const reasonSelectRef = useRef<HTMLSelectElement | null>(null);
  const shouldFocusReopenRef = useRef(false);

  useEffect(() => {
    if (isConfirming || !shouldFocusReopenRef.current) return;
    shouldFocusReopenRef.current = false;
    focusQueued(() => reopenButtonRef.current);
  }, [isConfirming]);

  function openConfirmation() {
    setHasError(false);
    setIsConfirming(true);
    setMessage(null);
    setReasonCode('');
    focusQueued(() => reasonSelectRef.current);
  }

  function dismissConfirmation() {
    setHasError(false);
    setIsConfirming(false);
    setMessage(null);
    setReasonCode('');
    shouldFocusReopenRef.current = true;
  }

  function focusAfterSuccess() {
    const row = confirmButtonRef.current?.closest(
      '[data-testid="agent-crm-task-completed-queue-row"]'
    );
    const nextRow = row?.nextElementSibling?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const previousRow = row?.previousElementSibling?.querySelector<HTMLElement>(
      'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
    );
    const heading = document.querySelector<HTMLElement>(
      '[data-testid="agent-crm-task-completed-queue-title"]'
    );

    focusQueued(() => nextRow ?? previousRow ?? heading);
  }

  function submitReopen() {
    if (!reasonCode) {
      setHasError(true);
      setMessage(t('error.invalid_reason'));
      reasonSelectRef.current?.focus();
      return;
    }

    setHasError(false);
    setIsSubmitting(true);
    setMessage(t('confirming'));
    void (async () => {
      try {
        const result = await submitAgentCrmTaskQueueReopenAction({
          expectedLifecycleVersion,
          reasonCode,
          taskId,
        });

        if (result.success) {
          setHasError(false);
          setIsConfirming(false);
          setReasonCode('');
          setMessage(t('success'));
          setIsSubmitting(false);
          focusAfterSuccess();
          router.refresh();
          return;
        }

        setHasError(true);
        setMessage(t(`error.${result.error}`));
      } catch {
        setHasError(true);
        setMessage(t('error.transient'));
      } finally {
        setIsSubmitting(false);
      }
    })();
  }

  if (!isConfirming) {
    return (
      <fieldset className="m-0 inline-flex min-w-0 justify-end border-0 p-0">
        <legend className="sr-only">{t('groupFor', { label: rowLabel })}</legend>
        <TaskQueueIconButton
          ref={reopenButtonRef}
          ariaLabel={t('openFor', { label: rowLabel })}
          disabled={isSubmitting}
          onClick={openConfirmation}
          icon={<RotateCcw className="h-4 w-4" aria-hidden="true" />}
          testId="agent-crm-task-completed-queue-reopen"
        >
          {t('open')}
        </TaskQueueIconButton>
        <p id={messageId} className="sr-only" aria-live="polite">
          {message ?? ''}
        </p>
      </fieldset>
    );
  }

  return (
    <TaskQueueReasonConfirmation
      confirmButtonRef={confirmButtonRef}
      confirmLabel={t('confirm')}
      confirmingLabel={t('confirming')}
      disabled={isSubmitting}
      dismissLabel={t('dismiss')}
      fieldLabel={t('field')}
      groupLabel={t('confirmGroupFor', { label: rowLabel })}
      hasError={hasError}
      isSubmitting={isSubmitting}
      messageId={messageId}
      onDismiss={dismissConfirmation}
      onReasonChange={setReasonCode}
      onSubmit={submitReopen}
      placeholder={t('placeholder')}
      reasonCode={reasonCode}
      reasonLabel={reason => t(`reasons.${reason}`)}
      reasonSelectId={reasonSelectId}
      reasonSelectRef={reasonSelectRef}
      reasons={AGENT_CRM_TASK_QUEUE_REOPEN_REASON_CODES}
      testIds={{
        confirm: 'agent-crm-task-completed-queue-reopen-confirm',
        dismiss: 'agent-crm-task-completed-queue-reopen-dismiss',
        select: 'agent-crm-task-completed-queue-reopen-reason',
      }}
    >
      <p
        id={messageId}
        className={message ? 'text-xs text-muted-foreground' : 'sr-only'}
        aria-live="polite"
      >
        {message ?? ''}
      </p>
    </TaskQueueReasonConfirmation>
  );
}
