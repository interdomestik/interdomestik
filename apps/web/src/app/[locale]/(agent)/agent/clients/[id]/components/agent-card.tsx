import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { User } from 'lucide-react';

import { MemberRecord } from '../_core';

interface AgentCardProps {
  readonly member: MemberRecord;
  readonly t: (key: string) => string;
}

export function AgentCard({ member, t }: AgentCardProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-medium">{t('sections.agent')}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        {member.agent ? (
          <div className="flex items-center gap-3">
            <Avatar className="h-10 w-10">
              <AvatarImage src={member.agent.image || ''} />
              <AvatarFallback>
                {(member.agent.name || member.agent.email || 'A')[0]?.toUpperCase()}
              </AvatarFallback>
            </Avatar>
            <div>
              <p className="font-medium text-foreground">
                {member.agent.name || t('labels.unknown')}
              </p>
              <p className="text-muted-foreground">{member.agent.email}</p>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 text-muted-foreground">
            <User className="h-4 w-4" />
            {t('labels.no_agent')}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
