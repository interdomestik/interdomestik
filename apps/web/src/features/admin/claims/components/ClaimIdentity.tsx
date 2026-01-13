interface ClaimIdentityProps {
  code: string;
  title: string;
}

/**
 * ClaimIdentity — Code + title row (Phase 2.5)
 *
 * Medium weight in visual hierarchy.
 * Code is muted, title is prominent.
 */
export function ClaimIdentity({ code, title }: ClaimIdentityProps) {
  return (
    <div className="flex items-center gap-2" data-testid="claim-identity">
      <span className="font-mono text-[10px] text-muted-foreground/70 shrink-0 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50">
        {code}
      </span>
      <h3 className="text-sm font-semibold tracking-tight text-slate-900 truncate" title={title}>
        {title}
      </h3>
    </div>
  );
}
