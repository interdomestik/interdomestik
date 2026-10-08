import { Button } from '@interdomestik/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@interdomestik/ui/components/select';
import { AlertCircle, MessageSquare, RefreshCcw, UserCog } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { StaffAssignmentSelect, type StaffAssignmentOption } from './StaffAssignmentSelect';

export type AssignmentIntent = 'assign' | 'reassign';

const SECONDARY_SELECT_TRIGGER_CLASS =
  'h-7 text-xs gap-1.5 text-slate-600 hover:text-slate-900 px-2.5 py-1 rounded-md border bg-slate-50/50 hover:bg-slate-50 transition-colors w-auto shadow-none focus:ring-1 focus:ring-slate-200';

interface NextActionSecondaryProps {
  secondary: { type: string; label?: string }[];
  allStaff: readonly StaffAssignmentOption[];
  allowedTransitions: string[];
  canAssign: boolean;
  isPending: boolean;
  onAction: (type: string) => void;
  onAssign: (staffId: string, intent: AssignmentIntent) => void;
  onStatusUpdate: (status: string) => void;
}

export function NextActionSecondary({
  secondary,
  allStaff,
  allowedTransitions,
  canAssign,
  isPending,
  onAction,
  onAssign,
  onStatusUpdate,
}: NextActionSecondaryProps) {
  const t = useTranslations('admin.claims_page.next_actions');
  const tStatus = useTranslations('claims.status');

  if (secondary.length === 0) return null;

  const getActionLabel = (action: { type: string; label?: string }) => {
    if (action.label) return action.label;
    return t(`actions.${action.type}.label`, { defaultMessage: action.type });
  };

  const getActionIcon = (type: string) => {
    switch (type) {
      case 'update_status':
        return RefreshCcw;
      case 'message_respond':
      case 'message_poke':
        return MessageSquare;
      case 'reassign':
        return UserCog;
      case 'escalate':
        return AlertCircle;
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col gap-2 pt-3 border-t mt-3">
      <div className="flex items-center gap-2">
        <span className="text-[10px] font-bold text-muted-foreground/50 uppercase tracking-widest pl-1">
          {t('secondary_label')}
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {secondary.map((action, idx) => {
          const Icon = getActionIcon(action.type);

          if (action.type === 'assign') {
            if (!canAssign) return null;
            return (
              <StaffAssignmentSelect
                key={idx}
                size="compact"
                staffOptions={allStaff}
                isPending={isPending}
                onSelect={staffId => onAssign(staffId, 'assign')}
                className={SECONDARY_SELECT_TRIGGER_CLASS}
              />
            );
          }

          if (action.type === 'reassign') {
            if (!canAssign) return null;
            return (
              <Select
                key={idx}
                value=""
                onValueChange={staffId => onAssign(staffId, 'reassign')}
                disabled={isPending || allStaff.length === 0}
              >
                <SelectTrigger
                  aria-label={getActionLabel(action)}
                  className={SECONDARY_SELECT_TRIGGER_CLASS}
                >
                  {Icon && <Icon className="w-3 h-3 opacity-70" />}
                  {getActionLabel(action)}
                </SelectTrigger>
                <SelectContent>
                  {allStaff.map(member => (
                    <SelectItem key={member.id} value={member.id} className="text-xs">
                      {member.name || member.email}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }

          if (action.type === 'update_status') {
            return (
              <Select key={idx} onValueChange={onStatusUpdate} disabled={isPending}>
                <SelectTrigger
                  aria-label={getActionLabel(action)}
                  className={SECONDARY_SELECT_TRIGGER_CLASS}
                >
                  {Icon && <Icon className="w-3 h-3 opacity-70" />}
                  {getActionLabel(action)}
                </SelectTrigger>
                <SelectContent>
                  {allowedTransitions.map(status => (
                    <SelectItem key={status} value={status} className="text-xs">
                      {tStatus(status)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            );
          }

          return (
            <Button
              key={idx}
              variant="ghost"
              size="sm"
              disabled={isPending}
              className="h-7 text-xs gap-1.5 text-slate-600 hover:text-slate-900 border hover:border-slate-200 hover:bg-slate-50/80 px-2.5 py-1"
              onClick={() => onAction(action.type)}
            >
              {Icon && <Icon className="w-3 h-3 opacity-70" />}
              {getActionLabel(action)}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
