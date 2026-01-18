'use client';

import { Badge } from '@interdomestik/ui';
import { Shield } from 'lucide-react';
import { CashVerificationRequestDTO } from '../../server/types';

interface VerificationRowCellsProps {
  request: CashVerificationRequestDTO;
}

/** Branch cell: code badge + name */
export function BranchCell({ request }: VerificationRowCellsProps) {
  return (
    <div className="flex flex-col gap-1">
      <Badge variant="outline" className="w-fit text-[10px] tracking-wider font-mono">
        {request.branchCode}
      </Badge>
      <span
        className="text-xs text-muted-foreground truncate max-w-[140px]"
        title={request.branchName}
      >
        {request.branchName}
      </span>
    </div>
  );
}

/** Lead cell: name, email, agent */
export function LeadCell({ request }: VerificationRowCellsProps) {
  return (
    <div className="flex flex-col">
      <span className="font-medium text-sm">
        {request.firstName} {request.lastName}
      </span>
      <span className="text-xs text-muted-foreground font-mono">{request.email}</span>
      <div className="flex items-center gap-1.5 mt-1 text-xs text-muted-foreground">
        <Shield className="w-3 h-3" />
        <span>{request.agentName}</span>
      </div>
    </div>
  );
}

/** Amount cell */
export function AmountCell({ request }: VerificationRowCellsProps) {
  return (
    <span className="font-bold text-base tabular-nums tracking-tight">
      {(request.amount / 100).toLocaleString('de-DE', {
        style: 'currency',
        currency: request.currency,
      })}
    </span>
  );
}
