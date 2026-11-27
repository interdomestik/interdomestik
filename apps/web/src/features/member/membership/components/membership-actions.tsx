'use client';

import type { OpsAction } from '@/components/ops/types';
import { Button } from '@interdomestik/ui';

type MembershipActionsProps = Readonly<{
  primary?: OpsAction;
  secondary: readonly OpsAction[];
}>;

/**
 * The membership actions in one row that wraps, so long labels (German, Macedonian) stack at 320px
 * instead of pushing a control outside the member shell. Order matches the shared ops action bar.
 */
export function MembershipActions({ primary, secondary }: MembershipActionsProps) {
  const actions = [
    ...secondary
      .filter(action => action.visible !== false)
      .map(action => ({ action, variant: action.variant ?? ('outline' as const) })),
    ...(primary && primary.visible !== false
      ? [{ action: primary, variant: primary.variant ?? ('default' as const) }]
      : []),
  ];
  if (actions.length === 0) return null;

  return (
    <div
      className="flex min-w-0 flex-wrap gap-2 border-t border-[hsl(var(--border-strong))] pt-4 forced-colors:border-[CanvasText]"
      data-testid="membership-actions"
    >
      {actions.map(({ action, variant }) => (
        <Button
          key={action.id ?? action.label}
          variant={variant}
          onClick={action.onClick}
          disabled={action.disabled}
          aria-busy={action.disabled || undefined}
          title={action.disabledReason}
          data-testid={action.testId}
          className="h-auto min-h-11 max-w-full whitespace-normal text-start [overflow-wrap:anywhere]"
        >
          {action.icon}
          {action.label}
        </Button>
      ))}
    </div>
  );
}
