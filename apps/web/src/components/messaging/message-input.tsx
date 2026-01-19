'use client';

import { Button } from '@interdomestik/ui/components/button';
import { Checkbox } from '@interdomestik/ui/components/checkbox';
import { Label } from '@interdomestik/ui/components/label';
import { Textarea } from '@interdomestik/ui/components/textarea';
import { Loader2, Lock, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

interface MessageInputProps {
  allowInternal?: boolean;
  isAgent?: boolean;
  onSendMessage: (content: string, isInternal: boolean) => Promise<boolean>;
}

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim() || isSending) return;

    setIsSending(true);
    setError(null);

    const success = await onSendMessage(content, isInternal);

    if (success) {
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
          className="min-h-[80px] pr-12 resize-none"
          disabled={isSending}
        />
        <Button
          type="submit"
          size="icon"
          className="absolute bottom-2 right-2"
          disabled={isSending || !content.trim()}
          data-testid="send-message-button"
        >
          {isSending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
        </Button>
      </div>

      {error && (
        <p className="text-xs text-destructive font-medium" data-testid="message-inline-error">
          {error}
        </p>
      )}

      {allowInternal && (
        <div className="flex items-center gap-2">
          <Checkbox
            id="internal"
            data-testid="internal-note-toggle"
            checked={isInternal}
            onCheckedChange={checked => setIsInternal(checked === true)}
            disabled={isSending}
          />
          <Label
            htmlFor="internal"
            className="text-sm text-muted-foreground flex items-center gap-1"
          >
            <Lock className="h-3 w-3" />
            {t('internalNoteLabel')}
          </Label>
        </div>
      )}

      <p className="text-xs text-muted-foreground">{t('shortcut')}</p>
    </form>
  );
}
