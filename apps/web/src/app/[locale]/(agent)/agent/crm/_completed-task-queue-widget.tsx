import { Link } from '@/i18n/routing';
import { Button } from '@interdomestik/ui';
import { ArrowRight } from 'lucide-react';
import { getTranslations } from 'next-intl/server';
import { type AgentCrmCompletedTaskQueueItem } from './_core';
import { TaskQueueReopenControls } from './task-queue-reopen-controls';

export function CompletedTaskQueueWidget({
  completedFormatter,
  queue,
  t,
}: Readonly<{
  completedFormatter: Intl.DateTimeFormat;
  queue: readonly AgentCrmCompletedTaskQueueItem[];
  t: Awaited<ReturnType<typeof getTranslations>>;
}>) {
  return (
    <section
      className="rounded-lg border bg-white p-6 shadow-sm"
      data-testid="agent-crm-task-completed-queue-ready"
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2
            className="text-lg font-semibold"
            data-testid="agent-crm-task-completed-queue-title"
            tabIndex={-1}
          >
            {t('crm.taskQueue.completed.title')}
          </h2>
          <p className="text-sm text-muted-foreground">
            {t('crm.taskQueue.completed.description')}
          </p>
        </div>
        <div
          className="rounded-full bg-emerald-100 px-3 py-1 text-sm font-medium text-emerald-900"
          aria-label={t('crm.taskQueue.completed.countLabel', { count: queue.length })}
          data-testid="agent-crm-task-completed-queue-count"
        >
          {t('crm.taskQueue.completed.count', { count: queue.length })}
        </div>
      </div>
      {queue.length === 0 ? (
        <p className="mt-6 text-sm text-muted-foreground">{t('crm.taskQueue.completed.empty')}</p>
      ) : (
        <div className="mt-6 divide-y">
          {queue.map(item => {
            const rowLabel = item.leadDisplayRef.label || t('crm.taskQueue.unknownLead');
            return (
              <div
                key={item.taskId}
                className="flex flex-col gap-3 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between"
                data-lead-id={item.subjectReference.id}
                data-task-id={item.taskId}
                data-testid="agent-crm-task-completed-queue-row"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium">{rowLabel}</p>
                  <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1 text-sm text-muted-foreground">
                    <span>{t(`crm.taskQueue.status.${item.status}`)}</span>
                    <span>{t(`crm.taskQueue.priority.${item.priority}`)}</span>
                    {item.completionReasonCode ? (
                      <span>
                        {t(`crm.taskQueue.completionReasons.${item.completionReasonCode}`)}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 text-xs text-muted-foreground">
                    {t('crm.taskQueue.completed.completedAt', {
                      date: completedFormatter.format(new Date(item.completedAt)),
                    })}
                  </p>
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:items-end">
                  <TaskQueueReopenControls
                    expectedLifecycleVersion={item.lifecycleVersion}
                    rowLabel={rowLabel}
                    taskId={item.taskId}
                  />
                  <Button variant="outline" size="sm" asChild>
                    <Link href={item.href} data-testid="agent-crm-task-completed-queue-open">
                      {t('crm.taskQueue.openLead')}
                      <ArrowRight className="h-4 w-4" aria-hidden="true" />
                    </Link>
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}
