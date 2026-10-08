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
import type { ReactNode } from 'react';
import { StaffAssignmentSelect, type StaffAssignmentOption } from './StaffAssignmentSelect';

interface NextActionPrimaryProps {
  readonly primary: {
    type: string;
    label?: string;
    variant?: 'default' | 'destructive' | 'outline' | 'secondary' | 'ghost' | 'link' | null;
  } | null;
  readonly isPending: boolean;
  readonly canAssign: boolean;
  readonly staffOptions: readonly StaffAssignmentOption[];
  readonly onAssign: (staffId: string) => void;
  readonly onAction: (type: string) => void;
}

export function NextActionPrimary({
  primary,
  isPending,
  canAssign,
  staffOptions,
  onAssign,
  onAction,
}: NextActionPrimaryProps) {
  const t = useTranslations('admin.claims_page.next_actions');
  const tAssignment = useTranslations('admin.claims_page.assignment');

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

  const describePrimary = (): string => {
    if (!primary) return t('no_action');
    // Assignment targets an explicitly chosen staff member; the self-ownership copy does not apply.
    if (primary.type === 'assign') return canAssign ? tAssignment('placeholder') : t('no_action');
    return t(`actions.${primary.type}.description`, { defaultMessage: '' });
  };

  const currentLabel =
    primary?.label ||
    (primary ? t(`actions.${primary.type}.label`, { defaultMessage: primary.type }) : '');
  const currentDesc = describePrimary();

  // Assignment renders the staff selector only for assigners; non-assigners get no control and
  // the neutral copy from describePrimary.
  const renderControl = (): ReactNode => {
    if (!primary) return null;
    if (primary.type === 'assign') {
      if (!canAssign) return null;
      return (
        <StaffAssignmentSelect
          staffOptions={staffOptions}
          isPending={isPending}
          onSelect={onAssign}
          className="shadow-sm"
        />
      );
    }
    return (
      <Button
        size="sm"
        variant={primary.variant || 'default'}
        onClick={() => onAction(primary.type)}
        disabled={isPending}
        className="gap-2 shadow-sm"
      >
        {getIcon(primary.type)}
        {currentLabel}
      </Button>
    );
  };

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

      <div className="flex items-center gap-2">{renderControl()}</div>
    </div>
  );
}
