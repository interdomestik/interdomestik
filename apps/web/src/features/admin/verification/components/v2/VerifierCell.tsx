'use client';

import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@interdomestik/ui';
import { MessageSquare, UserCheck } from 'lucide-react';
import { CashVerificationRequestDTO } from '../../server/types';

interface VerifierCellProps {
  request: CashVerificationRequestDTO;
}

export function VerifierCell({ request }: VerifierCellProps) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex items-center gap-2">
        <UserCheck className="w-3 h-3 text-muted-foreground" />
        <span className="text-sm">{request.verifierName || '-'}</span>
      </div>
      {request.verificationNote && (
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
