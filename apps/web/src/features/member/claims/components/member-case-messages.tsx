'use client';

import { formatPilotDateTime } from '@/lib/utils/date';
import { Button, Card, CardContent, CardHeader, CardTitle, Textarea } from '@interdomestik/ui';
import { useLocale, useTranslations } from 'next-intl';
import { useId } from 'react';
import { useMemberCaseMessagesScroll } from './member-case-messages-scroll';
import { useMemberCaseMessages } from './member-case-messages-state';

interface MemberCaseMessagesProps {
  readonly claimId: string;
  readonly currentUser: { id: string };
}

export function MemberCaseMessages(props: MemberCaseMessagesProps) {
  return <CaseMessages key={`${props.claimId}:${props.currentUser.id}`} {...props} />;
}

function CaseMessages({ claimId, currentUser }: MemberCaseMessagesProps) {
  const t = useTranslations('messaging');
  const locale = useLocale();
  const inputId = useId();
  const state = useMemberCaseMessages(claimId, currentUser.id);
  const scroll = useMemberCaseMessagesScroll(state.messages, state.sentCount);
  let statusMessage = '';
  if (state.sending) statusMessage = t('sending');
  else if (state.sendStatus === 'sent') statusMessage = t('sent');
  else if (state.loading) statusMessage = t('member.loading');

  return (
    <Card data-testid="messaging-panel" className="min-w-0">
      <CardHeader className="flex flex-row flex-wrap items-center justify-between gap-2">
        <CardTitle>{t('title')}</CardTitle>
        <Button
          type="button"
          variant="outline"
          onClick={() => void state.refresh()}
          disabled={state.loading}
        >
          {t(state.loadError || state.readError ? 'retry' : 'member.refresh')}
        </Button>
      </CardHeader>
      <CardContent className="space-y-4">
        <p role="status" aria-live="polite" className="text-sm text-muted-foreground">
          {statusMessage}
        </p>
        {state.loadError && <p role="alert">{t('member.loadError')}</p>}
        {state.readError && <p role="alert">{t('member.readError')}</p>}
        {state.sendStatus === 'error' && <p role="alert">{t('member.sendError')}</p>}
        {!state.loading && !state.loadError && state.messages.length === 0 && (
          <div className="text-sm text-muted-foreground">
            <p>{t('empty.title')}</p>
            <p>{t('empty.description')}</p>
          </div>
        )}
        {state.messages.length > 0 && (
          <ol
            ref={scroll.ref}
            onScroll={scroll.onScroll}
            tabIndex={0 /* NOSONAR: Keyboard access to this named scroll container. */}
            aria-label={t('title')}
            className="max-h-96 space-y-4 overflow-y-auto rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
          >
            {state.messages.map(message => (
              <li key={message.id} className="min-w-0 rounded-lg border p-3">
                <div className="flex flex-wrap justify-between gap-2 text-sm text-muted-foreground">
                  <span className="break-words [overflow-wrap:anywhere]">
                    {message.sender.name}
                  </span>
                  <time dateTime={new Date(message.createdAt).toISOString()}>
                    {formatPilotDateTime(message.createdAt, locale, '')}
                  </time>
                  {message.senderId === currentUser.id && message.readAt && (
                    <span>{t('member.read')}</span>
                  )}
                </div>
                <p className="mt-2 whitespace-pre-wrap break-words [overflow-wrap:anywhere]">
                  {message.content}
                </p>
              </li>
            ))}
          </ol>
        )}
        <form
          className="space-y-2"
          onSubmit={event => {
            event.preventDefault();
            void state.send();
          }}
        >
          <label htmlFor={inputId} className="text-sm font-medium">
            {t('member.label')}
          </label>
          <Textarea
            data-testid="message-input"
            id={inputId}
            value={state.draft}
            maxLength={2000}
            disabled={state.sending}
            aria-describedby={`${inputId}-hint`}
            placeholder={t('placeholder')}
            onChange={event => state.setDraft(event.target.value)}
            onKeyDown={event => {
              if (
                (event.ctrlKey || event.metaKey) &&
                event.key === 'Enter' &&
                !event.nativeEvent.isComposing
              ) {
                event.preventDefault();
                void state.send();
              }
            }}
          />
          <p id={`${inputId}-hint`} className="text-xs text-muted-foreground">
            {t('member.hint')}
          </p>
          <Button
            data-testid="send-message-button"
            type="submit"
            disabled={state.sending || !state.draft.trim()}
          >
            {t('member.send')}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
