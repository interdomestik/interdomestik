import { cn } from '../../lib/utils';
import { crystalFocus, crystalStateTone, type CrystalState } from './tokens';

export interface StepperItem {
  id: string;
  label: string;
  state: Exclude<CrystalState, 'current'>;
  stateLabel: string;
  href?: string;
}

export interface StepperProps {
  ariaLabel: string;
  currentStepId?: string;
  steps: readonly StepperItem[];
  className?: string;
}

export function Stepper({ ariaLabel, className, currentStepId, steps }: Readonly<StepperProps>) {
  return (
    <ol aria-label={ariaLabel} className={cn('grid min-w-0 gap-3 sm:grid-cols-2', className)}>
      {steps.map((step, index) => {
        const state: CrystalState = step.id === currentStepId ? 'current' : step.state;
        const current = state === 'current' ? 'step' : undefined;
        const content = (
          <>
            <span
              aria-hidden="true"
              className={cn(
                'flex size-7 shrink-0 items-center justify-center rounded-full border text-xs font-bold forced-colors:border-[CanvasText]',
                crystalStateTone[state]
              )}
            >
              {index + 1}
            </span>
            <span className="min-w-0">
              <span className="block break-words font-medium">{step.label}</span>
              <span className="block text-xs text-foreground/70">{step.stateLabel}</span>
            </span>
          </>
        );
        return (
          <li key={step.id} data-state={state} className="min-w-0">
            {step.href ? (
              <a
                href={step.href}
                aria-current={current}
                className={cn('flex min-h-11 items-center gap-3 rounded-xl p-2', crystalFocus)}
              >
                {content}
              </a>
            ) : (
              <span aria-current={current} className="flex min-h-11 items-center gap-3 p-2">
                {content}
              </span>
            )}
          </li>
        );
      })}
    </ol>
  );
}
