'use client';

import type { MessageWithSender } from '@/actions/messages';
import { isMember } from '@/lib/roles';
import { Avatar, AvatarFallback, AvatarImage } from '@interdomestik/ui/components/avatar';
import { Badge } from '@interdomestik/ui/components/badge';
import { Card } from '@interdomestik/ui/components/card';
import { cn } from '@interdomestik/ui/lib/utils';
import { Lock, MessageSquare } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useEffect, useRef } from 'react';

interface MessageThreadProps {
  readonly messages: MessageWithSender[];
  readonly currentUserId: string;
  readonly isAgent?: boolean;
}

export function MessageThread({ messages, currentUserId, isAgent = false }: MessageThreadProps) {
  const t = useTranslations('messaging');
  const scrollRef = useRef<HTMLDivElement>(null);

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages]);

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
    return new Date(date).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  };

  const formatDate = (date: Date) => {
    const d = new Date(date);
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
    {} as Record<string, MessageWithSender[]>
  );

  return (
    <div ref={scrollRef} className="flex-1 p-4 overflow-auto">
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
                const isOwn = message.senderId === currentUserId;
                const isAgentMessage = !isMember(message.sender.role);

                return (
                  <div
                    key={message.id}
                    className={cn('flex gap-3', isOwn ? 'justify-end' : 'justify-start')}
                  >
                    {!isOwn && (
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={message.sender.image ?? undefined} />
                        <AvatarFallback>
                          {message.sender.name.charAt(0).toUpperCase()}
                        </AvatarFallback>
                      </Avatar>
                    )}

                    <div className={cn('max-w-[75%] space-y-1', isOwn && 'items-end')}>
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
                          'rounded-2xl px-4 py-2 text-sm',
                          isOwn
                            ? 'bg-[hsl(var(--primary))] text-white rounded-br-md'
                            : 'bg-[hsl(var(--muted))] rounded-bl-md',
                          message.isInternal &&
                            'border-2 border-dashed border-amber-400 bg-amber-50'
                        )}
                      >
                        {message.isInternal && isAgent && (
                          <div className="flex items-center gap-1 text-amber-700 text-xs mb-1">
                            <Lock className="h-3 w-3" />
                            <span>{t('internalNote')}</span>
                          </div>
                        )}
                        <p className="whitespace-pre-wrap">{message.content}</p>
                      </div>

                      <span className="text-[10px] text-muted-foreground">
                        {formatTime(message.createdAt)}
                        {message.readAt && isOwn && <span className="ml-1">✓</span>}
                      </span>
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
