import { after } from 'next/server';
import { describePublicReplyFailure } from '@interdomestik/domain-communications/messages/send';
import {
  loadPreviewEmail,
  loadPreviewSubscriptions,
  type PreviewRecipient,
} from './delivery-targets';
import { resolveRecipientPreview } from './recipient-preview';
import { deliverPreviewPush } from './deliver-preview-push';

type Preview = NonNullable<Awaited<ReturnType<typeof resolveRecipientPreview>>>;

/** Reuse the public-reply post-commit pattern after the in-app-only producer succeeds. */
export function schedulePreviewDelivery(
  args: PreviewRecipient & {
    event: string;
    email: (to: string, preview: Preview) => Promise<unknown>;
    push?: { claimId: string; senderName: string; message: string };
  }
) {
  const recipient = { authority: args.authority, recipientId: args.recipientId };
  try {
    after(async () => {
      const jobs = [
        async () => {
          const to = await loadPreviewEmail(recipient);
          if (!to) return;
          const preview = await resolveRecipientPreview(
            args.authority,
            args.recipientId,
            args.event
          );
          if (preview) await args.email(to, preview);
        },
      ];
      if (args.push) {
        const push = args.push;
        jobs.push(async () => {
          const subscriptions = await loadPreviewSubscriptions(recipient);
          if (!subscriptions.length) return;
          const preview = await resolveRecipientPreview(
            args.authority,
            args.recipientId,
            args.event
          );
          if (!preview) return;
          await deliverPreviewPush(recipient, subscriptions, {
            title: preview.copy?.title ?? 'New Message',
            body: preview.copy?.content ?? `${push.senderName}: ${push.message.substring(0, 100)}`,
            url: `/dashboard/claims/${push.claimId}`,
          });
        });
      }
      const results = await Promise.allSettled(jobs.map(job => job()));
      for (const result of results) {
        if (result.status === 'rejected')
          console.error(
            'Failed to deliver notification:',
            describePublicReplyFailure(result.reason)
          );
      }
    });
  } catch (error) {
    console.error('Failed to schedule notification:', describePublicReplyFailure(error));
  }
}
