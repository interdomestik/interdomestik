import { OpsStatusBadge, OpsTable, toOpsBadgeVariant } from '@/components/ops';
import {
  Badge,
  Button,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@interdomestik/ui';
import {
  Check,
  Clock,
  Eye,
  FileText,
  HelpCircle,
  MessageSquare,
  Shield,
  UserCheck,
  X,
} from 'lucide-react';
import { useTranslations } from 'next-intl';
import { CashVerificationRequestDTO } from '../server/types';

interface VerificationTableProps {
  data: CashVerificationRequestDTO[];
  historyMode: boolean;
  onViewDetails: (id: string) => void;
  onVerify: (id: string, decision: 'approve') => void;
  onAction: (id: string, decision: 'reject' | 'needs_info') => void;
}

export function VerificationTable({
  data,
  historyMode,
  onViewDetails,
  onVerify,
  onAction,
}: VerificationTableProps) {
  const t = useTranslations('admin.leads');

  const baseColumns = [
    { key: 'branch', header: t('table.branch') },
    { key: 'lead', header: t('table.lead') },
    { key: 'agent', header: t('table.agent') },
    { key: 'proof', header: t('table.proof') },
    { key: 'amount', header: t('table.amount') },
  ];

  const historyColumns = [
    { key: 'status', header: t('table.status') },
    { key: 'verifier', header: t('table.verifier') },
    { key: 'date', header: t('table.date') },
  ];

  const columns = historyMode ? [...baseColumns, ...historyColumns] : baseColumns;

  // Helper for custom badges that OpsStatusBadge might not cover fully (like Resubmitted special case)
  // or combining multiple badges
  const renderStatusCell = (req: CashVerificationRequestDTO) => {
    if (req.status === 'pending' && req.isResubmission) {
      return (
        <Badge className="bg-purple-100 text-purple-700 border-purple-200">
          {t('status.resubmitted')}
        </Badge>
      );
    }
    return (
      <OpsStatusBadge
        variant={toOpsBadgeVariant(req.status)}
        label={t(`status.${req.status}` as any)}
      />
    );
  };

  const rows = data.map(req => {
    const cells = [
      <div key="branch" className="flex flex-col">
        <Badge variant="outline" className="w-fit mb-1">
          {req.branchCode}
        </Badge>
        <span className="text-xs text-muted-foreground">{req.branchName}</span>
      </div>,
      <div key="lead">
        <div className="font-medium">
          {req.firstName} {req.lastName}
        </div>
        <div className="text-xs text-muted-foreground font-mono">{req.email}</div>
      </div>,
      <TooltipProvider key="agent">
        <Tooltip>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-2 cursor-help w-fit">
              <Shield className="w-3 h-3 text-muted-foreground" />
              <span className="text-sm">{req.agentName}</span>
            </div>
          </TooltipTrigger>
          <TooltipContent>
            <p>{req.agentEmail}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>,
      <div key="proof">
        {req.documentPath ? (
          <Button variant="ghost" size="sm" asChild className="h-8">
            <a
              href={`/api/documents/${req.documentId}/download`}
              target="_blank"
              rel="noopener noreferrer"
            >
              <FileText className="w-4 h-4 mr-2 text-blue-600" />
              <span className="text-blue-600 underline-offset-4 hover:underline">
                {t('actions.view_proof')}
              </span>
            </a>
          </Button>
        ) : (
          <Badge variant="outline" className="text-yellow-600 border-yellow-600 bg-yellow-50">
            {t('labels.missing_proof')}
          </Badge>
        )}
      </div>,
      <span key="amount" className="font-bold text-green-600">
        {(req.amount / 100).toLocaleString('de-DE', {
          style: 'currency',
          currency: req.currency,
        })}
      </span>,
    ];

    if (historyMode) {
      cells.push(
        renderStatusCell(req),
        <div key="verifier">
          <div className="flex items-center gap-2">
            <UserCheck className="w-3 h-3 text-muted-foreground" />
            <span className="text-sm">{req.verifierName || '-'}</span>
          </div>
          {req.verificationNote && (
            <TooltipProvider>
              <Tooltip>
                <TooltipTrigger asChild>
                  <div className="flex items-center gap-1 text-xs text-muted-foreground mt-1 cursor-help">
                    <MessageSquare className="w-3 h-3" />
                    <span className="truncate max-w-[100px]">{req.verificationNote}</span>
                  </div>
                </TooltipTrigger>
                <TooltipContent className="max-w-[300px]">
                  <p>{req.verificationNote}</p>
                </TooltipContent>
              </Tooltip>
            </TooltipProvider>
          )}
        </div>,
        <div key="date" className="text-xs text-muted-foreground flex items-center gap-1">
          <Clock className="w-3 h-3" />
          {new Date(req.updatedAt).toLocaleDateString()}
        </div>
      );
    }

    const actions = !historyMode ? (
      <div className="flex justify-end gap-2 items-center">
        {req.isResubmission && (
          <Badge className="bg-purple-100 text-purple-700 border-purple-200 mr-2">
            {t('status.resubmitted')}
          </Badge>
        )}
        {req.status === 'needs_info' && (
          <Badge variant="secondary" className="bg-orange-100 text-orange-700 mr-2">
            {t('status.needs_info')}
          </Badge>
        )}

        {/* Details Button */}
        <Button
          variant="ghost"
          size="icon"
          onClick={() => onViewDetails(req.id)}
          title={t('actions.details')}
        >
          <Eye className="w-4 h-4 text-muted-foreground" />
        </Button>

        <Button
          size="sm"
          variant="outline"
          className="text-green-600 border-green-600 hover:bg-green-50"
          onClick={() => onVerify(req.id, 'approve')}
          data-testid="cash-approve"
        >
          <Check className="w-4 h-4 mr-1" />
        </Button>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onAction(req.id, 'needs_info')}
          data-testid="cash-needs-info"
        >
          <HelpCircle className="w-4 h-4 mr-1" />
        </Button>
        <Button
          size="sm"
          variant="destructive"
          onClick={() => onAction(req.id, 'reject')}
          data-testid="cash-reject"
        >
          <X className="w-4 h-4 mr-1" />
        </Button>
      </div>
    ) : undefined;

    return {
      id: req.id,
      cells,
      actions,
      testId: 'cash-verification-row',
    };
  });

  return (
    <OpsTable
      columns={columns}
      rows={rows}
      emptyLabel={t('empty_state')}
      actionsHeader={!historyMode ? t('table.actions') : undefined}
    />
  );
}
