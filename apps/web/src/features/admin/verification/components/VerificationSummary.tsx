import { Badge, Separator } from '@interdomestik/ui';
import { useTranslations } from 'next-intl';
import { CashVerificationDetailsDTO } from '../server/types';

interface VerificationSummaryProps {
  data: CashVerificationDetailsDTO;
}

export function VerificationSummary({ data }: VerificationSummaryProps) {
  const t = useTranslations('admin.leads');

  const getStatusBadge = (status: string) => {
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
    <div className="space-y-4">
      <div className="flex justify-between items-start">
        <div>
          <h3 className="font-semibold text-lg">
            {data.firstName} {data.lastName}
          </h3>
          <p className="text-sm text-muted-foreground">{data.email}</p>
        </div>
        {getStatusBadge(data.status)}
      </div>

      <div className="grid grid-cols-2 gap-4 text-sm">
        <div className="p-3 bg-muted/50 rounded-md">
          <span className="text-muted-foreground block text-xs uppercase">{t('table.amount')}</span>
          <span className="font-medium text-lg">
            {(data.amount / 100).toLocaleString('de-DE', {
              style: 'currency',
              currency: data.currency,
            })}
          </span>
        </div>
        <div className="p-3 bg-muted/50 rounded-md">
          <span className="text-muted-foreground block text-xs uppercase">{t('table.branch')}</span>
          <span className="font-medium">{data.branchName}</span>
        </div>
      </div>
      <Separator />
    </div>
  );
}
