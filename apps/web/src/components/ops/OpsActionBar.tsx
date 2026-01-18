'use client';

import { Button } from '@interdomestik/ui';
import type { ReactNode } from 'react';
import type { OpsAction } from './types';

interface OpsActionBarProps {
  primary?: OpsAction;
  secondary?: OpsAction[];
  children?: ReactNode;
  align?: 'start' | 'end';
  className?: string;
}

export function OpsActionBar({
  primary,
  secondary = [],
  children,
  align = 'end',
  className,
}: OpsActionBarProps) {
  const classes = ['pt-4 border-t mt-auto', className].filter(Boolean).join(' ');
  const justify = align === 'start' ? 'justify-start' : 'justify-end';

  return (
    <div className={classes} data-testid="ops-action-bar">
      {children ? (
        children
      ) : (
        <div className={`flex gap-2 w-full ${justify}`}>
          {secondary.map(action => (
            <Button
              key={action.id ?? action.label}
              variant={action.variant ?? 'outline'}
              onClick={action.onClick}
              disabled={action.disabled}
              data-testid={action.testId}
            >
              {action.icon}
              {action.label}
            </Button>
          ))}
          {primary && (
            <Button
              variant={primary.variant ?? 'default'}
              onClick={primary.onClick}
              disabled={primary.disabled}
              data-testid={primary.testId}
            >
              {primary.icon}
              {primary.label}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}
