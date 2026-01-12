'use client';

import { Button } from '@interdomestik/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from '@interdomestik/ui/components/select';
import { useTranslations } from 'next-intl';

interface NextActionSecondaryProps {
  secondary: { type: string; label?: string }[];
  allStaff: { id: string; name: string | null; email: string }[];
  isPending: boolean;
  onAction: (type: string) => void;
  onAssign: (userId: string) => void;
}

export function NextActionSecondary({
  secondary,
  allStaff,
  isPending,
  onAction,
  onAssign,
}: NextActionSecondaryProps) {
  const t = useTranslations('admin.claims_page.next_actions');

  if (secondary.length === 0) return null;

  const getActionLabel = (action: { type: string; label?: string }) => {
    if (action.label) return action.label;
    return t(`actions.${action.type}.label`, { defaultMessage: action.type });
  };

  return (
    <div className="flex flex-wrap items-center gap-2 pt-2 border-t mt-1">
      <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider mr-1">
        {t('secondary_label')}:
      </span>
      {secondary.map((action, idx) => {
        if (action.type === 'reassign') {
          return (
            <Select key={idx} onValueChange={onAssign} disabled={isPending}>
              <SelectTrigger className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground px-3 py-1.5 rounded-md border-0 bg-transparent ring-0 focus:ring-0 shadow-none w-auto data-[placeholder]:text-muted-foreground">
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
        return (
          <Button
            key={idx}
            variant="ghost"
            size="sm"
            disabled={isPending}
            className="h-7 text-xs gap-1.5 text-muted-foreground hover:text-foreground"
            onClick={() => onAction(action.type)}
          >
            {getActionLabel(action)}
          </Button>
        );
      })}
    </div>
  );
}
