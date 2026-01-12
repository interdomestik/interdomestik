'use client';

import {
  getMessagesForClaim,
  markMessagesAsRead,
  type MessageWithSender,
} from '@/actions/messages';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useCallback, useEffect, useState, useTransition } from 'react';
import { MessageInput } from './message-input';
import { MessageThread } from './message-thread';

interface MessagingPanelProps {
  readonly claimId: string;
  readonly currentUserId: string;
  readonly isAgent?: boolean;
  readonly initialMessages?: MessageWithSender[];
}

export function MessagingPanel({
  claimId,
  currentUserId,
  isAgent = false,
  initialMessages = [],
}: MessagingPanelProps) {
  const t = useTranslations('messaging');
  const [messages, setMessages] = useState<MessageWithSender[]>(initialMessages);
  const [isLoading, setIsLoading] = useState(initialMessages.length === 0);
  const [isPending, startTransition] = useTransition();

  const fetchMessages = useCallback(async () => {
    const result = await getMessagesForClaim(claimId);
    if (result.success && result.messages) {
      setMessages(result.messages);

      // Mark unread messages as read
      const unreadIds = result.messages
        .filter(m => m.senderId !== currentUserId && !m.readAt)
        .map(m => m.id);

      if (unreadIds.length > 0) {
        await markMessagesAsRead(unreadIds);
      }
    }
    setIsLoading(false);
  }, [claimId, currentUserId]);

  useEffect(() => {
    fetchMessages();

    // Poll for new messages every 30 seconds
    const interval = setInterval(fetchMessages, 30000);
    return () => clearInterval(interval);
  }, [fetchMessages]);

  const handleRefresh = useCallback(() => {
    startTransition(async () => {
      await fetchMessages();
    });
  }, [fetchMessages]);

  const handleMessageSent = handleRefresh;

  return (
    <Card className="flex flex-col h-[500px] shadow-sm" data-testid="messaging-panel">
      <CardHeader className="flex flex-row items-center justify-between py-2.5 px-4 border-b">
        <CardTitle className="text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 flex items-center gap-2">
          <MessageSquare className="h-4 w-4" />
          {t('title')}
          {messages.length > 0 && (
            <span className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded-full">
              {messages.length}
            </span>
          )}
        </CardTitle>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8"
          onClick={handleRefresh}
          disabled={isPending}
        >
          <RefreshCw className={`h-4 w-4 ${isPending ? 'animate-spin' : ''}`} />
        </Button>
      </CardHeader>

      <CardContent className="flex-1 flex flex-col p-0 overflow-hidden">
        {isLoading ? (
          <div className="flex-1 flex items-center justify-center">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <MessageThread messages={messages} currentUserId={currentUserId} isAgent={isAgent} />
        )}

        <MessageInput claimId={claimId} isAgent={isAgent} onMessageSent={handleMessageSent} />
      </CardContent>
    </Card>
  );
}
