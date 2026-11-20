'use client';

import { Button } from '@interdomestik/ui/components/button';
import { Checkbox } from '@interdomestik/ui/components/checkbox';
import { Label } from '@interdomestik/ui/components/label';
import { Textarea } from '@interdomestik/ui/components/textarea';
import { Loader2, Lock, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useRef, useState } from 'react';
import { createClientMessageId } from './client-message-id';

interface MessageInputProps {
  allowInternal?: boolean;
  isAgent?: boolean;
  /** `clientMessageId` stays the same while an unchanged draft is resubmitted after a failure. */
  onSendMessage: (
    content: string,
    isInternal: boolean,
    clientMessageId: string
  ) => Promise<boolean>;
}

type PendingDraft = { content: string; isInternal: boolean; clientMessageId: string };

export function MessageInput({
  allowInternal = false,
  isAgent = false,
  onSendMessage,
}: MessageInputProps) {
  const t = useTranslations('messaging');
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isSending, setIsSending] = useState(false);
  // One retry key per unchanged draft: resubmitting it after a lost response cannot send it twice.
  const pendingDraft = useRef<PendingDraft | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    const pending = pendingDraft.current;
    const clientMessageId =
      pending?.content === content && pending.isInternal === isInternal
        ? pending.clientMessageId
        : createClientMessageId();
    pendingDraft.current = { content, isInternal, clientMessageId };
    const success = await onSendMessage(content, isInternal, clientMessageId);

    if (success) {
      pendingDraft.current = null;
      setContent('');
      setIsInternal(false);
    } else {
      // Error handling
      setError(t('sendError')); // Generic error, parent handles specific logic if needed
    }
    setIsSending(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Submit on Ctrl+Enter or Cmd+Enter
    if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  const QUICK_REPLIES = ['greeting', 'docs_request', 'status_update', 'closing'] as const;

  const handleQuickReply = (key: string) => {
    const text = t(`quickReplies.${key}`);
    setContent(prev => (prev ? `${prev}\n${text}` : text));
  };

  return (
    <form onSubmit={handleSubmit} className="border-t p-4 space-y-3">
      {isAgent && (
        <div className="flex gap-2 mb-2 overflow-x-auto pb-2 scrollbar-thin">
          {QUICK_REPLIES.map(key => (
            <Button
              key={key}
              type="button"
              variant="outline"
              size="sm"
              className="whitespace-nowrap h-7 text-xs px-2.5 rounded-full"
              onClick={() => handleQuickReply(key)}
              disabled={isSending}
              data-testid={`quick-reply-${key}`}
            >
              {t(`quickReplies.${key}`)}
            </Button>
          ))}
        </div>
      )}

      <div className="relative">
        <Textarea
          data-testid="message-input"
          value={content}
          onChange={e => {
            setContent(e.target.value);
            if (error) setError(null);
          }}
          onKeyDown={handleKeyDown}
          placeholder={t('placeholder')}
          className="min-h-[80px] pr-14 resize-none sm:pr-12"
          disabled={isSending}
        />
        <Button
          type="submit"
          size="icon"
          className="absolute bottom-2 right-2 h-11 w-11 sm:h-10 sm:w-10"
          disabled={isSending || !content.trim()}
          aria-label={t('member.send')}
          data-testid="send-message-button"
        >
          {isSending ? (
            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <Send className="h-4 w-4" aria-hidden="true" />
          )}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive font-medium" data-testid="message-inline-error">
          {error}
        </p>
      )}

      {allowInternal && (
        <div className="flex min-h-11 min-w-0 items-center gap-2" data-testid="internal-note-row">
          {/* The pseudo-element widens the 16px box to a 44px hit area; the label fills the row. */}
          <Checkbox
            id="internal"
            data-testid="internal-note-toggle"
            className="relative after:absolute after:-inset-3.5 after:content-['']"
            checked={isInternal}
            onCheckedChange={checked => setIsInternal(checked === true)}
            disabled={isSending}
          />
          <Label
            htmlFor="internal"
            className="flex min-h-11 min-w-0 flex-1 cursor-pointer flex-wrap items-center gap-1 text-sm text-muted-foreground [overflow-wrap:anywhere]"
          >
            <Lock className="h-3 w-3 shrink-0" />
            {t('internalNoteLabel')}
          </Label>
        </div>
      )}

      {allowInternal && isAgent && !isInternal && (
        <p className="text-xs text-muted-foreground" data-testid="messaging-public-audience">
          {t('publicAudience')}
        </p>
      )}

      <p className="text-xs text-muted-foreground">{t('shortcut')}</p>
    </form>
  );
}
