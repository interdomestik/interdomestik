'use client';

import { deniesClaimMessageContent } from '@/lib/branch-manager-message-boundary';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@interdomestik/ui';
import { MessageSquare, UserCheck } from 'lucide-react';
import { CashVerificationRequestDTO } from '../../server/types';

interface VerifierCellProps {
  request: CashVerificationRequestDTO;
  viewerRole?: string | null;
}

export function VerifierCell({ request, viewerRole }: VerifierCellProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <UserCheck className="w-3 h-3 text-muted-foreground" />
        <span className="text-sm">{request.verifierName || '-'}</span>
      </div>
      {!deniesClaimMessageContent(viewerRole) && request.verificationNote && (
        <TooltipProvider>
          <Tooltip>
            <TooltipTrigger asChild>
              <div className="flex items-center gap-1 text-xs text-muted-foreground cursor-help max-w-[150px] truncate">
                <MessageSquare className="w-3 h-3 flex-shrink-0" />
                <span>{request.verificationNote}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent className="max-w-[300px]">
              <p>{request.verificationNote}</p>
            </TooltipContent>
          </Tooltip>
        </TooltipProvider>
      )}
    </div>
  );
}
