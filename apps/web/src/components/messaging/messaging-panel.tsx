'use client';

import type { MessageWithSender } from '@/actions/messages';
import { Button } from '@interdomestik/ui/components/button';
import { Card, CardContent, CardHeader, CardTitle } from '@interdomestik/ui/components/card';
import { AlertCircle, Loader2, MessageSquare, RefreshCw } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { type ReactNode, useCallback, useState, useTransition } from 'react';
import { MessageInput } from './message-input';
import { MessageThread } from './message-thread';
import { NO_MESSAGES, useMessageReadState } from './use-message-read-state';

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
  readonly fetchOnMount?: boolean;
  readonly readOnly?: boolean;
  /** Set when the server-rendered read of this conversation failed. No extra query is issued. */
  readonly initialReadFailed?: boolean;
}

/**
 * Scope shell: keying by claim, user and role guarantees that a new scope never renders the
 * previous history, optimistic sends or draft while its first read is still pending.
 */
export function MessagingPanel(props: MessagingPanelProps) {
  const { claimId, currentUser } = props;

  return (
    <ScopedMessagingPanel key={`${claimId}|${currentUser.id}|${currentUser.role}`} {...props} />
  );
}

function ScopedMessagingPanel({
  claimId,
  currentUser,
  isAgent = false,
  allowInternal = false,
  initialMessages = NO_MESSAGES,
  fetchOnMount = true,
  readOnly = false,
  initialReadFailed = false,
}: MessagingPanelProps) {
  const t = useTranslations('messaging');
  const {
    hasLoadedHistory,
    isFirstLoad,
    isReading,
    messages,
    readStatusFailed,
    refresh,
    retrievalFailed,
  } = useMessageReadState({
    claimId,
    currentUserId: currentUser.id,
    fetchOnMount,
    initialMessages,
    initialReadFailed,
  });
  const [optimisticMessages, setOptimisticMessages] = useState<OptimisticMessage[]>([]);
  const [isPending, startTransition] = useTransition();

  const handleRefresh = useCallback(() => {
    startTransition(async () => {
      await refresh();
    });
  }, [refresh]);

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
    // Remove failed message and re-trigger the same send.
    setOptimisticMessages(prev => prev.filter(m => m.id !== message.id));
    handleSendMessage(message.content, message.isInternal);
  };

  const allMessages = [...messages, ...optimisticMessages].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
  // Busy follows the actual in-flight read, not a control being natively disabled.
  const isBusy = isReading || isPending;
  // An empty conversation is only asserted once a read has really succeeded.
  const showThread = hasLoadedHistory || allMessages.length > 0;

  // The same three outcomes as before, decided once instead of inside nested markup ternaries:
  // the first pending read wins, then a loaded or optimistically filled thread, otherwise nothing.
  let conversation: ReactNode = null;
  if (isFirstLoad) {
    conversation = (
      <div className="flex-1 flex items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" aria-hidden="true" />
        <span className="sr-only">{t('read.loading')}</span>
      </div>
    );
  } else if (showThread) {
    conversation = (
      <MessageThread
        messages={allMessages}
        currentUser={currentUser}
        isAgent={isAgent}
        onRetry={handleRetry}
      />
    );
  }

  return (
    // 31.25rem is exactly the familiar 500px at the default root font size, but it now follows the
    // operator's text size: at doubled root text the conversation gets twice the room instead of
    // pushing the error, the retry control and the draft out of the panel.
    <Card
      aria-busy={isBusy}
      className="flex flex-col h-[31.25rem] shadow-sm"
      data-testid="messaging-panel"
    >
      <CardHeader className="flex flex-row shrink-0 items-center justify-between gap-2 py-2.5 px-4 border-b">
        <CardTitle className="min-w-0 text-xs font-semibold uppercase tracking-wider text-muted-foreground/80 flex flex-wrap items-center gap-2 break-words">
          <MessageSquare className="h-4 w-4 shrink-0" aria-hidden="true" />
          {t('title')}
          {messages.length > 0 && (
            <span
              className="text-xs text-primary bg-primary/10 px-1.5 py-0.5 rounded-full"
              data-testid="messaging-count"
            >
              {messages.length}
            </span>
          )}
        </CardTitle>
        <Button
          aria-busy={isBusy}
          aria-label={t('read.refresh')}
          className="h-8 w-8 shrink-0"
          data-testid="messaging-refresh"
          disabled={isPending}
          onClick={handleRefresh}
          size="icon"
          variant="ghost"
        >
          <RefreshCw className={`h-4 w-4 ${isBusy ? 'animate-spin' : ''}`} aria-hidden="true" />
        </Button>
      </CardHeader>

      {/* The column scrolls instead of clipping: when enlarged text or long localized copy needs
          more than the panel offers, the error, the retry control and the draft stay reachable. */}
      <CardContent
        className="flex-1 flex flex-col min-h-0 p-0 overflow-y-auto"
        data-testid="messaging-panel-content"
      >
        {retrievalFailed ? (
          <div
            className={
              showThread
                ? 'shrink-0 border-b px-3 py-3 space-y-2'
                : 'flex-1 flex flex-col items-start justify-center gap-3 px-3 py-4'
            }
            data-testid="messaging-read-error"
          >
            {/* Service failure, not invalid input: the draft stays put and recovery is offered.
                Native <output> carries the status role and polite live semantics itself, so the
                failure is still announced without an explicit role. */}
            <output className="flex items-start gap-2 text-sm text-destructive break-words">
              <AlertCircle className="h-4 w-4 shrink-0" aria-hidden="true" />
              <span>{t('read.loadError')}</span>
            </output>
            <Button
              aria-busy={isBusy}
              className="h-auto max-w-full whitespace-normal break-words px-3 py-2 text-left"
              data-testid="messaging-read-retry"
              onClick={handleRefresh}
              size="sm"
              type="button"
              variant="outline"
            >
              {t('read.retry')}
            </Button>
          </div>
        ) : null}

        {readStatusFailed ? (
          // Same polite announcement as before: <output> is a status live region natively.
          <output
            className="shrink-0 border-b px-3 py-2 text-xs text-muted-foreground break-words"
            data-testid="messaging-read-status-error"
          >
            {t('read.statusError')}
          </output>
        ) : null}

        {conversation}

        {readOnly ? null : (
          <MessageInput
            allowInternal={allowInternal}
            isAgent={isAgent}
            onSendMessage={handleSendMessage}
          />
        )}
      </CardContent>
    </Card>
  );
}
