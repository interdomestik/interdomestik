'use client';

import { setCorrespondenceFollowUp } from '@/actions/staff-claims/correspondence';
import { Link } from '@/i18n/routing';
import { formatPilotDateTime } from '@/lib/utils/date';
import { formatNumber } from '@/lib/utils/number';
import type {
  ClaimCorrespondenceEntry,
  CorrespondenceReplyParent,
} from '@interdomestik/domain-claims/claims/correspondence-read';
import { useLocale, useTranslations } from 'next-intl';
import { useId, type FormEvent } from 'react';
import {
  RegisterFeedback,
  RegisterInput,
  RegisterSubmit,
  formTimestamp,
  useRegisterMutation,
  utcInputValue,
  type RegisterDocument,
} from './case-register-controls';

function FollowUpForm({
  claimId,
  entry,
}: Readonly<{ claimId: string; entry: ClaimCorrespondenceEntry }>) {
  const t = useTranslations('staff-correspondence.list');
  const mutation = useRegisterMutation();

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    mutation.run(() =>
      setCorrespondenceFollowUp({
        claimId,
        correspondenceId: entry.id,
        expectedFollowUpAt: entry.followUpAt,
        followUpAt: formTimestamp(data, 'followUpAt'),
      })
    );
  }

  return (
    <form onSubmit={submit} className="grid gap-2">
      <RegisterInput
        key={entry.followUpAt}
        label={t('followUpUtc')}
        name="followUpAt"
        type="datetime-local"
        step="any"
        defaultValue={utcInputValue(entry.followUpAt)}
        readOnly={mutation.pending}
      />
      <RegisterSubmit pending={mutation.pending}>{t('saveFollowUp')}</RegisterSubmit>
      <RegisterFeedback {...mutation} />
    </form>
  );
}

function CorrespondenceRow({
  canWrite,
  claimId,
  entry,
  documentNames,
  parent,
  parentOnPage,
}: Readonly<{
  canWrite: boolean;
  claimId: string;
  entry: ClaimCorrespondenceEntry;
  documentNames: ReadonlyMap<string, string>;
  parent?: CorrespondenceReplyParent;
  parentOnPage: boolean;
}>) {
  const t = useTranslations('staff-correspondence');
  const locale = useLocale();
  const date = formatPilotDateTime(entry.occurredAt, locale, '');
  const parentLabel =
    parent &&
    t('list.inReplyTo', {
      organisation: parent.partyOrganisation,
      date: formatPilotDateTime(parent.occurredAt, locale, ''),
    });
  const linkedNames = entry.sharedDocumentIds.flatMap(id => {
    const name = documentNames.get(id);
    return name ? [{ id, name }] : [];
  });

  return (
    <li
      id={`correspondence-${entry.id}`}
      className="grid gap-2 break-words rounded-md border p-3"
      data-testid="staff-correspondence-entry"
    >
      <h3 className="font-semibold">{entry.partyOrganisation}</h3>
      <p className="flex flex-wrap gap-x-2 text-sm">
        <span>{t(`direction.${entry.direction}`)}</span>
        <span>{t(`party.${entry.partyKind}`)}</span>
        <span>{t(`channel.${entry.channel}`)}</span>
        <time dateTime={entry.occurredAt}>{date}</time>
      </p>
      {entry.partyReference && <p>{t('list.reference', { reference: entry.partyReference })}</p>}
      {entry.partyContactName && <p>{t('list.contact', { contact: entry.partyContactName })}</p>}
      <p className="whitespace-pre-wrap">{entry.body}</p>
      {parent &&
        (parentOnPage ? (
          <a href={`#correspondence-${parent.id}`} className="w-fit py-1 underline">
            {parentLabel}
          </a>
        ) : (
          <p>{parentLabel}</p>
        ))}
      {entry.sharedDocumentIds.length > 0 && (
        <div>
          <p>
            {t('list.documentsSent', {
              total: formatNumber(entry.sharedDocumentIds.length, locale) ?? '',
            })}
          </p>
          {linkedNames.length > 0 && (
            <ul className="ms-5 list-disc">
              {linkedNames.map(({ id, name }) => (
                <li key={id}>{name}</li>
              ))}
            </ul>
          )}
        </div>
      )}
      {entry.followUpAt && (
        <p>{t('list.followUp', { date: formatPilotDateTime(entry.followUpAt, locale, '') })}</p>
      )}
      {entry.answered && (
        <p className="font-medium" data-testid="staff-correspondence-answered">
          {t('list.answered')}
        </p>
      )}
      {entry.overdue && (
        <p className="font-medium text-amber-900" data-testid="staff-correspondence-overdue">
          {t('list.overdue')}
        </p>
      )}
      {canWrite && entry.direction === 'outbound' && (
        <FollowUpForm claimId={claimId} entry={entry} />
      )}
    </li>
  );
}

function RegisterPages({
  claimId,
  page,
  pages,
}: Readonly<{ claimId: string; page: number; pages: number }>) {
  const t = useTranslations('staff-correspondence.list');
  const locale = useLocale();
  const href = (target: number) => `/staff/claims/${claimId}?correspondencePage=${target}`;
  return (
    <nav aria-label={t('pages')} className="flex flex-wrap items-center gap-3 text-sm">
      {page > 1 && (
        <Link href={href(page - 1)} prefetch={false} className="underline">
          {t('previous')}
        </Link>
      )}
      <span aria-current="page">
        {t('position', {
          page: formatNumber(page, locale) ?? '',
          pages: formatNumber(pages, locale) ?? '',
        })}
      </span>
      {page < pages && (
        <Link href={href(page + 1)} prefetch={false} className="underline">
          {t('next')}
        </Link>
      )}
    </nav>
  );
}

export function ClaimCorrespondenceList({
  canWrite,
  claimId,
  entries,
  documents,
  replyParents = [],
  page = 1,
  perPage = entries.length,
  total = entries.length,
}: Readonly<{
  canWrite: boolean;
  claimId: string;
  entries: readonly ClaimCorrespondenceEntry[];
  documents: readonly RegisterDocument[];
  replyParents?: readonly CorrespondenceReplyParent[];
  page?: number;
  perPage?: number;
  total?: number;
}>) {
  const t = useTranslations('staff-correspondence.list');
  const title = useId();
  const names = new Map(documents.map(document => [document.id, document.name]));
  const byId = new Map(entries.map(entry => [entry.id, entry]));
  const parentsById = new Map(replyParents.map(parent => [parent.id, parent]));

  return (
    <section
      aria-labelledby={title}
      className="grid gap-3 rounded-lg border bg-card p-4"
      data-testid="staff-correspondence-list"
    >
      <h2 id={title} className="text-lg font-semibold">
        {t('title')}
      </h2>
      {entries.length === 0 ? (
        <p>{t('empty')}</p>
      ) : (
        <ul className="grid gap-2">
          {entries.map(entry => (
            <CorrespondenceRow
              key={entry.id}
              canWrite={canWrite}
              claimId={claimId}
              entry={entry}
              documentNames={names}
              parent={byId.get(entry.inReplyToId ?? '') ?? parentsById.get(entry.inReplyToId ?? '')}
              parentOnPage={byId.has(entry.inReplyToId ?? '')}
            />
          ))}
        </ul>
      )}
      {total > perPage && (
        <RegisterPages claimId={claimId} page={page} pages={Math.ceil(total / perPage)} />
      )}
    </section>
  );
}
