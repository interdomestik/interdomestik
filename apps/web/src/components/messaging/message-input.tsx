'use client';

import { sendMessage } from '@/actions/messages';
import { Button } from '@interdomestik/ui/components/button';
import { Checkbox } from '@interdomestik/ui/components/checkbox';
import { Label } from '@interdomestik/ui/components/label';
import { Textarea } from '@interdomestik/ui/components/textarea';
import { Loader2, Lock, Send } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { useState, useTransition } from 'react';
import { toast } from 'sonner';

interface MessageInputProps {
  claimId: string;
  allowInternal?: boolean;
  isAgent?: boolean;
  onMessageSent?: () => void;
}

export function MessageInput({
  claimId,
  allowInternal = false,
  isAgent = false,
  onMessageSent,
}: MessageInputProps) {
  const t = useTranslations('messaging');
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) return;

    startTransition(async () => {
      const result = await sendMessage(claimId, content, isInternal);

      if (result.success) {
        setContent('');
        setIsInternal(false);
        setError(null);
        onMessageSent?.();
        toast.success(t('sent'));
      } else {
        const errorMsg = result.error || t('sendError');
        setError(errorMsg);
        toast.error(errorMsg);
      }
    });
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
              disabled={isPending}
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
          disabled={isPending}
        />
        <Button
          type="submit"
          size="icon"
          className="absolute bottom-2 right-2"
          disabled={isPending || !content.trim()}
          data-testid="send-message-button"
        >
          {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
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
