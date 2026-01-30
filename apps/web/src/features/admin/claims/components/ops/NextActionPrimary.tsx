'use client';

import { Button } from '@interdomestik/ui/components/button';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Clock,
  HelpCircle,
  MessageSquare,
  UserPlus,
} from 'lucide-react';
import { useTranslations } from 'next-intl';

interface NextActionPrimaryProps {
  primary: {
    type: string;
    label?: string;
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null;
  } | null;
  isPending: boolean;
  onAction: (type: string) => void;
}

export function NextActionPrimary({ primary, isPending, onAction }: NextActionPrimaryProps) {
  const t = useTranslations('admin.claims_page.next_actions');

  const getIcon = (type: string) => {
    switch (type) {
      case 'assign':
        return <UserPlus className="w-4 h-4" />;
      case 'escalate':
      case 'ack_sla':
        return <AlertTriangle className="w-4 h-4" />;
      case 'review_blockers':
        return <HelpCircle className="w-4 h-4" />;
      case 'message_poke':
        return <MessageSquare className="w-4 h-4" />;
      case 'update_status':
        return <CheckCircle2 className="w-4 h-4" />;
      case 'reopen':
        return <Clock className="w-4 h-4" />;
      default:
        return <ArrowRight className="w-4 h-4" />;
    }
  };

  const currentLabel =
    primary?.label ||
    (primary ? t(`actions.${primary.type}.label`, { defaultMessage: primary.type }) : '');
  const currentDesc = primary
    ? t(`actions.${primary.type}.description`, { defaultMessage: '' })
    : t('no_action');

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="flex flex-col gap-1">
        <h3 className="font-semibold text-base flex items-center gap-2">
          {t('title')}
          {/* Active Ping if Primary Exists */}
          {primary && (
            <span className="relative flex h-2 w-2">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-primary opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2 w-2 bg-primary"></span>
            </span>
          )}
        </h3>
        <p className="text-sm text-muted-foreground">{currentDesc}</p>
      </div>

      <div className="flex items-center gap-2">
        {primary && (
          <Button
            size="sm"
            variant={primary.variant || 'default'}
            onClick={() => onAction(primary.type)}
            disabled={isPending}
            data-testid={`next-action-${primary.type}`}
            className="gap-2 shadow-sm"
          >
            {getIcon(primary.type)}
            {currentLabel}
          </Button>
        )}
      </div>
    </div>
  );
}
