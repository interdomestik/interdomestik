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
      <span className="text-xs font-mono text-muted-foreground/60">{code}</span>
      <h3 className="text-sm font-medium text-foreground truncate">{title}</h3>
    </div>
  );
}
