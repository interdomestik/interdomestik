import {
  Badge,
  Button,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
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

  const getStatusBadge = (status: string, isResubmission?: boolean) => {
    if (status === 'pending' && isResubmission) {
      return (
        <Badge className="bg-purple-100 text-purple-700 border-purple-200">
          {t('status.resubmitted')}
        </Badge>
      );
    }

    switch (status) {
      case 'succeeded':
        return (
          <Badge className="bg-green-100 text-green-700 border-green-200">
            {t('status.succeeded')}
          </Badge>
        );
      case 'rejected':
        return (
          <Badge className="bg-red-100 text-red-700 border-red-200">{t('status.rejected')}</Badge>
        );
      case 'needs_info':
        return (
          <Badge className="bg-orange-100 text-orange-700 border-orange-200">
            {t('status.needs_info')}
          </Badge>
        );
      default:
        return <Badge variant="outline">{t('status.pending')}</Badge>;
    }
  };

  return (
    <div className="rounded-md border bg-card">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>{t('table.branch')}</TableHead>
            <TableHead>{t('table.lead')}</TableHead>
            <TableHead>{t('table.agent')}</TableHead>
            <TableHead>{t('table.proof')}</TableHead>
            <TableHead>{t('table.amount')}</TableHead>
            {historyMode && <TableHead>{t('table.status')}</TableHead>}
            {historyMode && <TableHead>{t('table.verifier')}</TableHead>}
            {historyMode && <TableHead>{t('table.date')}</TableHead>}
            {!historyMode && <TableHead className="text-right">{t('table.actions')}</TableHead>}
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.length === 0 ? (
            <TableRow>
              <TableCell
                colSpan={historyMode ? 8 : 6}
                className="text-center py-12 text-muted-foreground"
              >
                {t('empty_state')}
              </TableCell>
            </TableRow>
          ) : (
            data.map(req => (
              <TableRow key={req.id} data-testid="cash-verification-row">
                <TableCell>
                  <div className="flex flex-col">
                    <Badge variant="outline" className="w-fit mb-1">
                      {req.branchCode}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{req.branchName}</span>
                  </div>
                </TableCell>
                <TableCell>
                  <div className="font-medium">
                    {req.firstName} {req.lastName}
                  </div>
                  <div className="text-xs text-muted-foreground font-mono">{req.email}</div>
                </TableCell>
                <TableCell>
                  <TooltipProvider>
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
                  </TooltipProvider>
                </TableCell>
                <TableCell>
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
                    <Badge
                      variant="outline"
                      className="text-yellow-600 border-yellow-600 bg-yellow-50"
                    >
                      {t('labels.missing_proof')}
                    </Badge>
                  )}
                </TableCell>
                <TableCell className="font-bold text-green-600">
                  {(req.amount / 100).toLocaleString('de-DE', {
                    style: 'currency',
                    currency: req.currency,
                  })}
                </TableCell>

                {historyMode && (
                  <>
                    <TableCell>{getStatusBadge(req.status, req.isResubmission)}</TableCell>
                    <TableCell>
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
                                <span className="truncate max-w-[100px]">
                                  {req.verificationNote}
                                </span>
                              </div>
                            </TooltipTrigger>
                            <TooltipContent className="max-w-[300px]">
                              <p>{req.verificationNote}</p>
                            </TooltipContent>
                          </Tooltip>
                        </TooltipProvider>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      <div className="flex items-center gap-1">
                        <Clock className="w-3 h-3" />
                        {new Date(req.updatedAt).toLocaleDateString()}
                      </div>
                    </TableCell>
                  </>
                )}

                {!historyMode && (
                  <TableCell className="text-right">
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
                  </TableCell>
                )}
              </TableRow>
            ))
          )}
        </TableBody>
      </Table>
    </div>
  );
}
