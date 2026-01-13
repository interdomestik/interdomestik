import { useTranslations } from 'next-intl';

interface ClaimMetadataProps {
  memberName: string;
  memberNumber?: string | null;
  branchCode: string | null;
  category: string | null;
  amount?: number | null;
}

/**
 * ClaimMetadata — Bottom metadata row (Phase 2.5)
 *
 * Low weight in visual hierarchy, muted styling.
 * On mobile (<md): single-line truncated with tooltip.
 * Amount shows fallback "—" when null/zero.
 */
export function ClaimMetadata({
  memberName,
  memberNumber,
  branchCode,
  category,
  amount,
}: ClaimMetadataProps) {
  const tCommon = useTranslations('common');
  const tCategory = useTranslations('claims.category');
  const tRow = useTranslations('admin.claims_page.table.row');

  const categoryLabel = category
    ? tCategory(category as Parameters<typeof tCategory>[0])
    : tCommon('none');

  const branchLabel = branchCode ?? tCommon('none');

  // Amount fallback per Phase 2.5 spec
  const amountDisplay =
    amount && amount > 0 ? `€${amount.toLocaleString()}` : tRow('amount_unknown');

  // Full text for tooltip (accessibility)
  const fullText = `${memberName} • ${branchLabel} • ${categoryLabel} • ${amountDisplay}`;

  // Condensed text for mobile
  const condensedText = tRow('metadata_condensed', {
    member: memberName,
    branch: branchLabel,
  });

  return (
    <div
      className="flex items-center gap-3 text-xs text-muted-foreground/70"
      data-testid="claim-metadata"
    >
      {/* Mobile: condensed single line with tooltip */}
      <span className="md:hidden truncate" title={fullText} aria-label={fullText}>
        {condensedText}
      </span>

      {/* Desktop: full metadata */}
      <div className="hidden md:flex md:items-center md:gap-3">
        <div className="flex items-center gap-1.5">
          <span>{memberName}</span>
          {memberNumber && (
            <span className="font-mono text-[10px] text-amber-700/80 bg-amber-50 px-1 rounded border border-amber-200/50">
              {memberNumber}
            </span>
          )}
        </div>
        <span>•</span>
        <span>{branchLabel}</span>
        <span>•</span>
        <span>{categoryLabel}</span>
        <span>•</span>
        <span className="font-medium">{amountDisplay}</span>
      </div>
    </div>
  );
}
