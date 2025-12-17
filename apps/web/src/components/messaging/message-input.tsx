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
  isAgent?: boolean;
  onMessageSent?: () => void;
}

export function MessageInput({ claimId, isAgent = false, onMessageSent }: MessageInputProps) {
  const t = useTranslations('messaging');
  const [content, setContent] = useState('');
  const [isInternal, setIsInternal] = useState(false);
  const [isPending, startTransition] = useTransition();

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    if (!content.trim()) return;

    startTransition(async () => {
      const result = await sendMessage(claimId, content, isInternal);

      if (result.success) {
        setContent('');
        setIsInternal(false);
        onMessageSent?.();
        toast.success(t('sent'));
      } else {
        toast.error(result.error || t('sendError'));
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

  return (
    <form onSubmit={handleSubmit} className="border-t p-4 space-y-3">
      <div className="relative">
        <Textarea
          data-testid="message-input"
          value={content}
          onChange={e => setContent(e.target.value)}
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

      {isAgent && (
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
