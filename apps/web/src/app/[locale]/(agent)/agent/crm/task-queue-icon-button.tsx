'use client';

import { Button } from '@interdomestik/ui';
import { forwardRef, type ComponentProps, type ReactNode } from 'react';

type TaskQueueIconButtonProps = Readonly<{
  children: ReactNode;
  disabled: boolean;
  icon: ReactNode;
  onClick: () => void;
  testId: string;
  variant?: ComponentProps<typeof Button>['variant'];
}>;

export const TaskQueueIconButton = forwardRef<HTMLButtonElement, TaskQueueIconButtonProps>(
  ({ children, disabled, icon, onClick, testId, variant = 'outline' }, ref) => (
    <Button
      ref={ref}
      type="button"
      variant={variant}
      size="sm"
      disabled={disabled}
      onClick={onClick}
      data-testid={testId}
    >
      {icon}
      {children}
    </Button>
  )
);

TaskQueueIconButton.displayName = 'TaskQueueIconButton';
