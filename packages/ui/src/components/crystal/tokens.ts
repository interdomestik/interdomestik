export const crystalFocus =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[hsl(var(--ring))] focus-visible:ring-offset-2';

export const crystalMotion =
  'motion-safe:transition motion-safe:duration-200 motion-reduce:transform-none motion-reduce:transition-none';

export const crystalStateTone = {
  completed: 'border-[hsl(var(--success))] bg-[hsl(var(--success))] text-[hsl(var(--muted-900))]',
  current: 'border-[hsl(var(--primary))] bg-[hsl(var(--primary))] text-white',
  future: 'border-[hsl(var(--border-strong))] bg-[hsl(var(--surface))] text-foreground',
  error: 'border-[hsl(var(--destructive))] bg-[hsl(var(--destructive))] text-white',
} as const;

export type CrystalState = keyof typeof crystalStateTone;
