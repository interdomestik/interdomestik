'use client';

import type { MessageWithSender } from '@/actions/messages';
import { isAgent as checkIsAgent, isStaffOrAdmin } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Badge } from '@interdomestik/ui/components/badge';
import { Button } from '@interdomestik/ui/components/button';
import { Card } from '@interdomestik/ui/components/card';
import { cn } from '@interdomestik/ui/lib/utils';
import { AlertCircle, Loader2, Lock, MessageSquare, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

type OptimisticMessage = MessageWithSender & {
  status?: 'pending' | 'failed';
};

interface MessageThreadProps {
  readonly messages: OptimisticMessage[];
  readonly currentUser: {
    id: string;
    name: string;
    image: string | null;
    role: string;
  };
  readonly isAgent?: boolean;
  readonly onRetry?: (message: OptimisticMessage) => void;
}

export function MessageThread({
  messages,
  currentUser,
  isAgent = false,
  onRetry,
}: MessageThreadProps) {
  const t = useTranslations('messaging');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages.length]);

  // Scroll to bottom when messages array length changes (new msg added)
  // Also when status changes? Maybe not strictly needed if height doesn't change much.

  if (messages.length === 0) {
    return (
      <Card
        className="flex-1 flex flex-col items-center justify-center p-8 text-center"
        data-testid="messaging-empty-state"
      >
        <div className="p-4 rounded-full bg-[hsl(var(--muted))] mb-4">
          <MessageSquare className="h-8 w-8 text-[hsl(var(--muted-foreground))]" />
        </div>
        <h3 className="font-semibold mb-2">{t('empty.title')}</h3>
        <p className="text-sm text-muted-foreground max-w-xs">{t('empty.description')}</p>
      </Card>
    );
  }

  const formatTime = (date: Date) => {
    if (isNaN(new Date(date).getTime())) return '';
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
    if (isNaN(d.getTime())) return '';

    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (d.toDateString() === today.toDateString()) {
      return t('today');
    } else if (d.toDateString() === yesterday.toDateString()) {
      return t('yesterday');
    } else {
      return d.toLocaleDateString();
    }
  };

  // Group messages by date
  const groupedMessages = messages.reduce(
    (groups, message) => {
      const date = new Date(message.createdAt).toDateString();
      if (!groups[date]) {
        groups[date] = [];
      }
      groups[date].push(message);
      return groups;
    },
    {} as Record<string, OptimisticMessage[]>
  );

  return (
    <div ref={scrollRef} className="flex-1 p-4 overflow-auto scroll-smooth">
      <div className="space-y-6">
        {Object.entries(groupedMessages).map(([date, dateMessages]) => (
          <div key={date}>
            <div className="flex items-center justify-center mb-4">
              <span className="text-xs text-muted-foreground bg-[hsl(var(--muted))] px-3 py-1 rounded-full">
                {formatDate(new Date(date))}
              </span>
            </div>

            <div className="space-y-4">
              {dateMessages.map(message => {
                const isOwn = message.senderId === currentUser.id;
                const isAgentMessage =
                  checkIsAgent(message.sender.role) || isStaffOrAdmin(message.sender.role);
                const isPending = message.status === 'pending';
                const isFailed = message.status === 'failed';

                return (
                  <div
                    key={message.id}
                    className={cn(
                      'flex gap-3 group',
                      isOwn ? 'justify-end' : 'justify-start',
                      isPending && 'opacity-70'
                    )}
                    data-testid={isFailed ? 'messaging-send-error' : undefined}
                  >
                    {!isOwn && (
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={message.sender.image ?? undefined} />
                        <AvatarFallback>
                          {message.sender.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div
                      className={cn('max-w-[75%] space-y-1', isOwn && 'items-end flex flex-col')}
                    >
                      {!isOwn && (
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-medium">{message.sender.name}</span>
                          {isAgentMessage && (
                            <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                              {t('agentBadge')}
                            </Badge>
                          )}
                        </div>
                      )}

                      <div
                        className={cn(
                          'rounded-2xl px-4 py-2 text-sm relative',
                          isOwn
                            ? 'bg-[hsl(var(--primary))] text-white rounded-br-md'
                            : 'bg-[hsl(var(--muted))] rounded-bl-md',
                          message.isInternal &&
                            'border-2 border-dashed border-amber-400 bg-amber-50 text-amber-900',
                          isFailed &&
                            'border-2 border-destructive bg-destructive/10 text-destructive'
                        )}
                      >
                        {message.isInternal && isAgent && (
                          <div
                            className={cn(
                              'flex items-center gap-1 text-xs mb-1',
                              isOwn && !message.isInternal ? 'text-white/80' : 'text-amber-700'
                            )}
                          >
                            <Lock className="h-3 w-3" />
                            <span>{t('internalNote')}</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap" data-testid="message-content">
                          {message.content}
                        </p>

                        {isPending && (
                          <span className="absolute bottom-1 right-2">
                            <Loader2 className="h-3 w-3 animate-spin text-white/70" />
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-muted-foreground flex items-center">
                          {formatTime(message.createdAt)}
                          {message.readAt && isOwn && <span className="ml-1">✓</span>}
                          {isPending && (
                            <span className="ml-1 italic text-[10px]">
                              {t('sending', { defaultMessage: 'Sending...' })}
                            </span>
                          )}
                        </span>

                        {isFailed && (
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-5 px-2 text-[10px] text-destructive hover:text-destructive hover:bg-destructive/10 gap-1"
                            onClick={() => onRetry?.(message)}
                          >
                            <RefreshCw className="h-3 w-3" />
                            Retry
                          </Button>
                        )}
                      </div>

                      {isFailed && (
                        <span className="text-[10px] text-destructive flex items-center gap-1">
                          <AlertCircle className="h-3 w-3" />
                          Failed to send
                        </span>
                      )}
                    </div>

                    {isOwn && (
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={message.sender.image ?? undefined} />
                        <AvatarFallback>
                          {message.sender.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
