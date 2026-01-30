interface ClaimIdentityProps {
  code: string;
  title: string;
  memberNumber?: string | null;
}

export function ClaimIdentity({ code, title, memberNumber }: ClaimIdentityProps) {
  return (
    <div className="flex items-center gap-2" data-testid="claim-identity">
      <span
        data-testid="claim-number"
        className="font-mono text-[10px] text-muted-foreground/70 shrink-0 bg-slate-100 px-1 py-0.5 rounded border border-slate-200/50"
      >
        {code}
      </span>
      {memberNumber && (
        <span className="font-mono text-[10px] text-amber-800/80 shrink-0 bg-amber-50/50 px-1 py-0.5 rounded border border-amber-200/50">
          {memberNumber}
        </span>
      )}
      <h3 className="text-sm font-semibold tracking-tight text-slate-900 truncate" title={title}>
        {title}
      </h3>
    </div>
  );
}
