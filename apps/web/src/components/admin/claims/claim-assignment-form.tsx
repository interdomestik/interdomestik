'use client';

import { assignClaim } from '@/actions/agent-claims';
import { Button } from '@interdomestik/ui/components/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@interdomestik/ui/components/select';
import { useTranslations } from 'next-intl';
import { useTransition } from 'react';
import { toast } from 'sonner';

type AgentOption = {
  id: string;
  name: string | null;
  email: string | null;
};

type ClaimAssignmentFormProps = {
  claimId: string;
  currentAgentId: string | null;
  agents: AgentOption[];
};

export function ClaimAssignmentForm({
  claimId,
  currentAgentId,
  agents,
}: ClaimAssignmentFormProps) {
  const tUsers = useTranslations('admin.users_table');
  const tCommon = useTranslations('common');
  const [isPending, startTransition] = useTransition();

  const handleAssign = (value: string) => {
    const nextAgentId = value === 'unassigned' ? null : value;

    startTransition(async () => {
      try {
        await assignClaim(claimId, nextAgentId);
        toast.success(tUsers('success_message'));
      } catch (error) {
        toast.error(tCommon('errors.generic'));
        console.error(error);
      }
    });
  };

  const currentValue = currentAgentId || 'unassigned';

  return (
    <div className="flex items-center gap-2">
      <Select value={currentValue} onValueChange={handleAssign} disabled={isPending}>
        <SelectTrigger className="w-[220px]">
          <SelectValue placeholder={tUsers('select_agent')} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="unassigned">{tUsers('unassigned')}</SelectItem>
          {agents.map(agent => (
            <SelectItem key={agent.id} value={agent.id}>
              {agent.name || agent.email || agent.id}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {isPending && (
        <Button variant="ghost" size="sm" disabled>
          {tCommon('processing')}
        </Button>
      )}
    </div>
  );
}
