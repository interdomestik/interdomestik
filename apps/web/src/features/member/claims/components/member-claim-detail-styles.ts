// Concept A ("Qartësi dhe besim") surfaces of the member case detail, shared with slice 1's cards.
const CARD_FRAME =
  'min-w-0 rounded-2xl border border-[hsl(var(--border-strong))] p-5 [overflow-wrap:anywhere] sm:p-6 forced-colors:border-[CanvasText]';
export const DETAIL_CARD = `${CARD_FRAME} bg-[hsl(var(--surface))]`;
// The header keeps `bg-card` (the same colour in both themes): the gate scopes its header locator by it
// (`e2e/gate/member-vault-consent-display.spec.ts`).
export const DETAIL_HEADER_CARD = `${CARD_FRAME} bg-card`;
export const DETAIL_HEADING = 'text-lg font-semibold tracking-tight';
export const DETAIL_TERM = 'text-sm text-foreground/70';
export const DETAIL_DIVIDER =
  'border-t border-[hsl(var(--border-strong))] pt-5 forced-colors:border-[CanvasText]';
export const DETAIL_BUTTON =
  'h-auto min-h-11 whitespace-normal rounded-xl px-4 py-2.5 font-semibold [overflow-wrap:anywhere]';
// The shared outline variant sets slate text and hover colours that fail contrast on the dark surface.
export const DETAIL_OUTLINE_BUTTON = `${DETAIL_BUTTON} border-foreground/60 bg-transparent text-foreground hover:bg-[hsl(var(--surface-strong))] hover:text-foreground forced-colors:border-[CanvasText]`;
export const DETAIL_QUIET_LINK =
  'inline-flex min-h-11 items-center gap-2 rounded-md text-sm font-medium text-foreground/70 underline-offset-4 hover:text-foreground hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:focus-visible:outline';
