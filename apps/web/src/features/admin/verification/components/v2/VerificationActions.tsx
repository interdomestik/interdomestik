'use client';

import { Button } from '@interdomestik/ui';
import { Check, Eye, HelpCircle, X } from 'lucide-react';
import { useTranslations } from 'next-intl';

interface VerificationActionsProps {
  id: string;
  onViewDetails: (id: string) => void;
  onVerify: (id: string) => void;
  onAction: (id: string, decision: 'reject' | 'needs_info') => void;
}

export function VerificationActions({
  id,
  onViewDetails,
  onVerify,
  onAction,
}: VerificationActionsProps) {
  const t = useTranslations('admin.leads.actions');

  return (
    <div className="flex justify-end items-center gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
      <Button
        variant="ghost"
        size="icon"
        onClick={() => onViewDetails(id)}
        title={t('details')}
        className="h-8 w-8"
      >
        <Eye className="w-4 h-4 text-muted-foreground" />
      </Button>

      <div className="h-4 w-px bg-border mx-1" />

      <Button
        size="sm"
        variant="outline"
        className="h-8 px-2 text-green-600 border-green-200 hover:bg-green-50 hover:border-green-300"
        onClick={() => onVerify(id)}
        data-testid="cash-approve"
        title={t('approve')}
      >
        <Check className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="outline"
        className="h-8 px-2 text-orange-600 border-orange-200 hover:bg-orange-50 hover:border-orange-300"
        onClick={() => onAction(id, 'needs_info')}
        data-testid="cash-needs-info"
        title={t('needs_info')}
      >
        <HelpCircle className="w-4 h-4" />
      </Button>
      <Button
        size="sm"
        variant="ghost"
        className="h-8 px-2 text-red-600 hover:bg-red-50 hover:text-red-700"
        onClick={() => onAction(id, 'reject')}
        data-testid="cash-reject"
        title={t('reject')}
      >
        <X className="w-4 h-4" />
      </Button>
    </div>
  );
}
