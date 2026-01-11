import { StatusBadge } from '@/components/claims/status-badge';
import { Link } from '@/i18n/routing';
import { ClaimsListV2Row } from '@/server/domains/claims/types';
import { Button, TableCell, TableRow } from '@interdomestik/ui';
import { AlertTriangle, Eye } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface ClaimsListRowProps {
  row: ClaimsListV2Row;
  showEmphasis: boolean;
}

export function ClaimsListRow({ row, showEmphasis }: ClaimsListRowProps) {
  const tTable = useTranslations('admin.claims_page.table');
  const tStatus = useTranslations('claims.status');
  const tStage = useTranslations('claims.stage');
  const tOwner = useTranslations('claims.owner');
  const tOwnerGenitive = useTranslations('claims.owner_genitive');
  const tCategory = useTranslations('claims.category');
  const tCommon = useTranslations('common');

  // Helpers (could be moved to utils if reused, keeping local for now as per plan/monolith simplifiction)
  // Re-implementing logic cleanly based on types

  // Translation lookups need strict keys, but data comes as string sometimes
  // We accept string access for flexibility in this view component
  const getStatusLabel = (key: string) => {
    // Check if key exists in 'claims.status' namespace?
    // next-intl throws or returns key if missing.
    // We assume keys match from backend enum.
    try {
      return tStatus(key as any);
    } catch {
      return key;
    }
  };

  const getStageLabel = (key: string) => {
    try {
      return tStage(key as any);
    } catch {
      // Fallback to status label if stage logic fails or key missing
      return getStatusLabel(key);
    }
  };

  const getCategoryLabel = (key: string | null) => {
    if (!key) return tCommon('none');
    try {
      return tCategory(key as any);
    } catch {
      return key;
    }
  };

  // Row Data Preparation
  const statusLabel = getStatusLabel(row.status);
  const currentStageKey =
    row.currentStage && row.currentStage !== 'unknown' ? row.currentStage : row.status;
  const stageLabel = getStageLabel(currentStageKey);

  // Calculate Days in Stage if not provided (fallback)
  // Backend provides `daysInCurrentStage`.
  const daysInStage = row.daysInCurrentStage ?? 0;

  // Owner Logic
  const ownerRole = row.currentOwnerRole ?? 'system';
  const ownerLabel = tOwner(ownerRole as any);
  const ownerLabelGenitive = tOwnerGenitive(ownerRole as any);
  const assignedLabel = row.staffName || row.staffEmail;

  let ownerLine = tTable('row.owner_system');
  if (ownerRole !== 'system' && ownerRole !== 'unknown') {
    if (ownerRole === 'staff' && assignedLabel) {
      ownerLine = tTable('row.owner_assigned', { name: assignedLabel, role: ownerLabel });
    } else {
      ownerLine = tTable('row.owner_waiting', { owner: ownerLabelGenitive });
    }
  }

  const branchLabel = row.branchCode ?? tCommon('none');
  const categoryLabel = getCategoryLabel(row.category);

  // Emphasis Style
  // Logic: Urgent/Attention statuses.
  // We pass `showEmphasis` as simple prop or compute here?
  // Passed as prop `getRowEmphasis` result logic from parent?
  // Parent computed grouping, maybe useful to keep logic there or duplicate constants?
  // Let's keep constants in parent for grouping, but visuals here?
  // Actually, props `showEmphasis` usually implies boolean.
  // Let's implement the border logic here for self-containment using constants.

  const URGENT_STATUSES = ['court'];
  const ATTENTION_STATUSES = ['submitted', 'verification', 'evaluation', 'negotiation'];

  let borderClass = 'border-l-4 border-l-transparent';
  if (URGENT_STATUSES.includes(row.status)) {
    borderClass = 'border-l-4 border-l-red-500/80';
  } else if (ATTENTION_STATUSES.includes(row.status)) {
    borderClass = 'border-l-4 border-l-amber-500/80';
  }

  return (
    <TableRow
      className={`hover:bg-white/5 border-white/5 transition-colors ${borderClass}`}
      data-testid={`admin-claim-row-${row.id}`}
    >
      <TableCell className="pl-6 py-4 align-top">
        <div className="flex items-start gap-3">
          <StatusBadge
            label={statusLabel}
            status={row.status}
            testId={`admin-claim-status-${row.id}`}
          />
          <div className="space-y-1">
            <div className="text-sm font-medium text-foreground">{row.title}</div>
            <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
              <span>{tTable('row.stage_line', { stage: stageLabel, days: daysInStage })}</span>
              {row.isStuck && (
                <span className="inline-flex items-center gap-1 text-amber-600">
                  <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                  {tTable('row.stuck')}
                </span>
              )}
            </div>
            <div className="text-xs text-muted-foreground">{ownerLine}</div>
            <div
              className="text-xs text-muted-foreground"
              title={row.branchName ?? undefined}
              data-testid={`admin-claim-branch-${row.id}`}
            >
              {tTable('row.branch_type', { branch: branchLabel, type: categoryLabel })}
            </div>
            <div className="text-xs text-muted-foreground">
              {tTable('row.member', {
                name: row.claimantName ?? tCommon('none'),
                email: row.claimantEmail ?? tCommon('none'),
              })}
            </div>
          </div>
        </div>
      </TableCell>
      <TableCell className="text-right pr-6 align-top">
        <Button
          asChild
          variant="ghost"
          size="icon"
          className="h-8 w-8 hover:bg-white/10 hover:text-emerald-400"
        >
          <Link href={`/admin/claims/${row.id}`}>
            <Eye className="h-4 w-4" />
            <span className="sr-only">{tCommon('view')}</span>
          </Link>
        </Button>
      </TableCell>
    </TableRow>
  );
}
