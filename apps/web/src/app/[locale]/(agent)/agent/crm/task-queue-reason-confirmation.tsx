'use client';

import { Check, X } from 'lucide-react';
import type { ReactNode, RefObject } from 'react';

import { TaskQueueIconButton } from './task-queue-icon-button';

export function TaskQueueReasonConfirmation<TReason extends string>({
  children,
  confirmButtonRef,
  confirmLabel,
  confirmingLabel,
  disabled,
  dismissLabel,
  fieldLabel,
  groupLabel,
  hasError,
  isSubmitting,
  messageId,
  onDismiss,
  onReasonChange,
  onSubmit,
  placeholder,
  reasonCode,
  reasonLabel,
  reasonSelectId,
  reasonSelectRef,
  reasons,
  testIds,
}: Readonly<{
  children?: ReactNode;
  confirmButtonRef: RefObject<HTMLButtonElement | null>;
  confirmLabel: string;
  confirmingLabel: string;
  disabled: boolean;
  dismissLabel: string;
  fieldLabel: string;
  groupLabel: string;
  hasError: boolean;
  isSubmitting: boolean;
  messageId: string;
  onDismiss: () => void;
  onReasonChange: (reasonCode: TReason | '') => void;
  onSubmit: () => void;
  placeholder: string;
  reasonCode: TReason | '';
  reasonLabel: (reasonCode: TReason) => string;
  reasonSelectId: string;
  reasonSelectRef: RefObject<HTMLSelectElement | null>;
  reasons: readonly TReason[];
  testIds: {
    readonly confirm: string;
    readonly dismiss: string;
    readonly select: string;
  };
}>) {
  return (
    <fieldset className="m-0 grid min-w-0 justify-items-end gap-2 border-0 p-0 text-sm">
      <legend className="sr-only">{groupLabel}</legend>
      <label className="sr-only" htmlFor={reasonSelectId}>
        {fieldLabel}
      </label>
      <select
        ref={reasonSelectRef}
        id={reasonSelectId}
        value={reasonCode}
        disabled={disabled}
        aria-describedby={messageId}
        aria-invalid={hasError ? true : undefined}
        onChange={event => onReasonChange(event.target.value as TReason | '')}
        className="min-h-9 rounded-md border border-input bg-background px-3 py-1 text-sm shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
        data-testid={testIds.select}
      >
        <option value="">{placeholder}</option>
        {reasons.map(reason => (
          <option key={reason} value={reason}>
            {reasonLabel(reason)}
          </option>
        ))}
      </select>
      <div className="flex flex-wrap justify-end gap-2">
        <TaskQueueIconButton
          ref={confirmButtonRef}
          disabled={disabled || !reasonCode}
          onClick={onSubmit}
          icon={<Check className="h-4 w-4" aria-hidden="true" />}
          testId={testIds.confirm}
        >
          {isSubmitting ? confirmingLabel : confirmLabel}
        </TaskQueueIconButton>
        <TaskQueueIconButton
          variant="ghost"
          disabled={disabled}
          onClick={onDismiss}
          icon={<X className="h-4 w-4" aria-hidden="true" />}
          testId={testIds.dismiss}
        >
          {dismissLabel}
        </TaskQueueIconButton>
      </div>
      {children}
    </fieldset>
  );
}
