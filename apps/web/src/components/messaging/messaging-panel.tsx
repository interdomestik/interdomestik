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

export type OptimisticMessage = MessageWithSender & {
  status?: 'pending' | 'failed';
  tempId?: string;
};

interface MessagingPanelProps {
  readonly claimId: string;
  readonly currentUser: {
    id: string;
    name: string;
    image: string | null;
    role: string;
  };
  readonly isAgent?: boolean;
  readonly allowInternal?: boolean;
  readonly initialMessages?: MessageWithSender[];
}

export function MessagingPanel({
  claimId,
  currentUser,
  isAgent = false,
  allowInternal = false,
  initialMessages = [],
}: MessagingPanelProps) {
  const t = useTranslations('messaging');
  const [messages, setMessages] = useState<MessageWithSender[]>(initialMessages);
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [isLoading, setIsLoading] = useState(initialMessages.length === 0);
  const [isPending, startTransition] = useTransition();

  const fetchMessages = useCallback(async () => {
    // Only fetch if tab is visible? For now simplistic.
    const result = await getMessagesForClaim(claimId);
    if (result.success && result.messages) {
      setMessages(result.messages);

      // Simple conflict resolution: Remove optimistic if real message arrived
      // We assume real message matches content? Or just clear all optimistic on sync?
      // Clearing all optimistic on sync might cause flickering if the sync happens before the send completes.
      // Better: MessageInput handles the "send complete" and tells us to remove specific optimistic ID.
      // But if fetch happens, we might have duplicates.
      // For now, E1 (minimal) -> we'll handle optimistic removal via callbacks.

      // Mark unread messages as read
      const unreadIds = result.messages
        .filter(m => m.senderId !== currentUser.id && !m.readAt)
        .map(m => m.id);

      if (unreadIds.length > 0) {
        await markMessagesAsRead(unreadIds);
      }
    }
    setIsLoading(false);
  }, [claimId, currentUser.id]);

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

  const handleSendMessage = async (content: string, isInternal: boolean): Promise<boolean> => {
    const tempId = `temp-${Date.now()}`;
    const optimisticMessage: OptimisticMessage = {
      id: tempId,
      claimId,
      senderId: currentUser.id,
      content,
      isInternal,
      readAt: null,
      createdAt: new Date(),
      sender: {
        id: currentUser.id,
        name: currentUser.name,
        image: currentUser.image,
        role: currentUser.role,
      },
      status: 'pending',
      tempId,
    };

    setOptimisticMessages(prev => [...prev, optimisticMessage]);

    try {
      const { sendMessage } = await import('@/actions/messages');
      const result = await sendMessage(claimId, content, isInternal);

      if (result.success) {
        // Remove optimistic message and refresh
        setOptimisticMessages(prev => prev.filter(m => m.id !== tempId));
        handleRefresh();
        return true;
      } else {
        // Mark as failed
        setOptimisticMessages(prev =>
          prev.map(m => (m.id === tempId ? { ...m, status: 'failed' } : m))
        );
        return false;
      }
    } catch {
      setOptimisticMessages(prev =>
        prev.map(m => (m.id === tempId ? { ...m, status: 'failed' } : m))
      );
      return false;
    }
  };

  const handleRetry = (message: OptimisticMessage) => {
    // Remove failed message and try again (UI will populate input? Or just re-send?)
    // Easiest for "Retry": Just re-trigger send with same content.
    setOptimisticMessages(prev => prev.filter(m => m.id !== message.id));
    handleSendMessage(message.content, message.isInternal);
  };

  const allMessages = [...messages, ...optimisticMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );

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
          <MessageThread
            messages={allMessages}
            currentUser={currentUser}
            isAgent={isAgent}
            onRetry={handleRetry}
          />
        )}

        <MessageInput
          allowInternal={allowInternal}
          isAgent={isAgent}
          onSendMessage={handleSendMessage}
        />
      </CardContent>
    </Card>
  );
}
