const ENTRY_LINK =
  'inline-flex min-h-11 min-w-11 max-w-full items-center justify-between gap-3 self-start rounded-xl border px-4 py-2.5 text-sm font-semibold [overflow-wrap:anywhere] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 forced-colors:border-[CanvasText] forced-colors:focus-visible:outline';
export const PRIMARY_LINK = `${ENTRY_LINK} border-primary bg-[hsl(var(--primary))] text-[hsl(var(--primary-foreground))] hover:underline`;
export const OUTLINED_LINK = `${ENTRY_LINK} border-foreground/60 hover:bg-[hsl(var(--surface-strong))]`;
