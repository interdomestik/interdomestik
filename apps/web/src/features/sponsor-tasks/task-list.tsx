'use client';

import { Link } from '@/i18n/routing';
import type { SponsorStaffTask } from '@interdomestik/domain-membership-billing/sponsors/staff-tasks';
import { useFormatter, useTranslations } from 'next-intl';
import type { ReactElement } from 'react';
import { entryReason, groupSponsorTasks } from './group-tasks.core';
import { TaskActionForm } from './task-action-form';

function TaskDetails({ task }: { task: SponsorStaffTask }): ReactElement {
  const t = useTranslations('sponsorTasks');
  const format = useFormatter();
  const date = (value: Date): string =>
    format.dateTime(value, { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' });
  return (
    <li className="space-y-4 rounded border p-4 break-words">
      {task.userId ? (
        <Link
          href={`/admin/users/${encodeURIComponent(task.userId)}`}
          className="underline focus-visible:outline focus-visible:outline-2"
        >
          {t('person', { id: task.userId })}
        </Link>
      ) : (
        <p>{t('unbound')}</p>
      )}
      {'intentId' in task && <p>{t('intent', { id: task.intentId })}</p>}
      {'entryId' in task && (
        <p>{t('entry', { id: task.entryId, term: task.termId, sponsor: task.sponsorId })}</p>
      )}
      {task.kind === 'intent_review' && <p>{t('since', { date: date(task.since) })}</p>}
      {task.kind === 'retrying_cancel' && <p>{t('attempts', { count: task.attempts })}</p>}
      {task.kind === 'observed_cancel' && <p>{t('observedAt', { date: date(task.at) })}</p>}
      {task.kind === 'scheduled_cancel' && <p>{t('scheduledAt', { date: date(task.at) })}</p>}
      {task.kind === 'charge' && (
        <>
          <p>{t('transaction', { id: task.providerTransactionId })}</p>
          <p>{t('billingPeriod', { date: date(task.billingPeriodStartsAt) })}</p>
          <TaskActionForm kind="acknowledge" id={task.chargeId} />
        </>
      )}
      {task.kind === 'entry_review' && <p>{t(`reasons.${entryReason(task.reason)}`)}</p>}
      {task.kind === 'checkout_race' && <p>{t('subscription', { id: task.subscriptionId })}</p>}
      {task.kind === 'unactivated_account' && (
        <>
          <p>{t('lastEnd', { date: date(task.lastEnd) })}</p>
          <p>{t('erasureRule')}</p>
        </>
      )}
      {task.kind === 'intent_review' && (
        <div className="grid gap-4 lg:grid-cols-2">
          <TaskActionForm kind="evidence" id={task.intentId} />
          <TaskActionForm kind="close" id={task.intentId} />
        </div>
      )}
    </li>
  );
}

function taskKey(task: SponsorStaffTask): string {
  if ('chargeId' in task) return task.chargeId;
  if ('intentId' in task) return task.intentId;
  if ('entryId' in task) return task.entryId;
  if ('subscriptionId' in task) return task.subscriptionId;
  return task.userId;
}

export function SponsorTaskList({ tasks }: { tasks: SponsorStaffTask[] }): ReactElement {
  const t = useTranslations('sponsorTasks');
  return (
    <div className="space-y-8">
      {tasks.length === 0 && <p role="status">{t('empty')}</p>}
      {groupSponsorTasks(tasks).map(group => (
        <section key={group.kind} aria-labelledby={`tasks-${group.kind}`} className="space-y-3">
          <h2 id={`tasks-${group.kind}`} className="text-xl font-semibold">
            {t(`kinds.${group.kind}.title`)}
          </h2>
          <p>{t(`kinds.${group.kind}.help`)}</p>
          <ul className="space-y-4">
            {group.tasks.map(task => (
              <TaskDetails key={taskKey(task)} task={task} />
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
