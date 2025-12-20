'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui';
import { MessageSquare } from 'lucide-react';

interface ClaimMessagesPaneProps {
  claimId: string;
  messages: any[];
  currentUserId: string;
  t: any;
}

export function ClaimMessagesPane({ claimId, messages, currentUserId, t }: ClaimMessagesPaneProps) {
  return (
    <Card className="lg:col-span-1">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <MessageSquare className="h-5 w-5" />
          {t('details.messages')}
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {messages.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">
              {t('details.no_messages')}
            </p>
          ) : (
            messages.map(msg => (
              <div key={msg.id} className="text-sm">
                <p className="font-medium">{msg.sender?.name || 'Unknown'}</p>
                <p className="text-muted-foreground">{msg.content}</p>
              </div>
            ))
          )}
        </div>
      </CardContent>
    </Card>
  );
}
