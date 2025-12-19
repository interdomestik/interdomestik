'use client';

import { AgentStatusSelect } from '@/components/agent/agent-status-select';
import { Avatar, AvatarFallback, AvatarImage, Card, CardContent, CardHeader, CardTitle, Separator } from '@interdomestik/ui';
import { format } from 'date-fns';
import { Building2, Calendar, DollarSign, Mail, User } from 'lucide-react';

interface ClaimInfoPaneProps {
  claim: any;
  t: any;
}

export function ClaimInfoPane({ claim, t }: ClaimInfoPaneProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('claim_details', { defaultValue: 'Claim Details' })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Claimant Info */}
        <div className="flex items-center gap-3">
          <Avatar>
            <AvatarImage src={claim.user?.image || undefined} />
            <AvatarFallback>
              {claim.user?.name?.charAt(0) || 'U'}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{claim.user?.name || 'Unknown'}</p>
            <p className="text-sm text-muted-foreground truncate">{claim.user?.email}</p>
          </div>
        </div>

        <Separator />

        {/* Claim Info */}
        <div className="space-y-3">
          <div className="flex items-start gap-2">
            <Building2 className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">Company</p>
              <p className="text-sm text-muted-foreground">{claim.companyName || 'N/A'}</p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <DollarSign className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">Amount</p>
              <p className="text-sm text-muted-foreground">
                {claim.claimAmount} {claim.currency || 'EUR'}
              </p>
            </div>
          </div>

          <div className="flex items-start gap-2">
            <Calendar className="h-4 w-4 mt-0.5 text-muted-foreground" />
            <div className="flex-1">
              <p className="text-sm font-medium">Incident Date</p>
              <p className="text-sm text-muted-foreground">
                {claim.incidentDate ? format(new Date(claim.incidentDate), 'PPP') : 'N/A'}
              </p>
            </div>
          </div>
        </div>

        <Separator />

        {/* Status */}
        <div>
          <p className="text-sm font-medium mb-2">Status</p>
          <AgentStatusSelect claimId={claim.id} currentStatus={claim.status} />
        </div>

        {/* Description */}
        <div>
          <p className="text-sm font-medium mb-2">Description</p>
          <p className="text-sm text-muted-foreground whitespace-pre-wrap">{claim.description}</p>
        </div>
      </CardContent>
    </Card>
  );
}
