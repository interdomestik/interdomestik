import { Novu } from '@novu/node';
import {
  sendClaimAssignedEmail,
  sendClaimSubmittedEmail,
  sendNewMessageEmail,
  sendStatusChangedEmail,
} from '@/lib/email';

// Lazy-initialize Novu client to avoid throwing on module load
let novu: Novu | null = null;

function getNovuClient(): Novu | null {
  if (novu) return novu;

  const apiKey = process.env.NOVU_API_KEY || process.env.NOVU_SECRET_KEY;
  if (!apiKey) {
    console.warn('Novu API key not configured. Notifications will be skipped.');
    return null;
  }

  try {
    novu = new Novu(apiKey);
    return novu;
  } catch (error) {
    console.warn('Failed to initialize Novu client:', error);
    return null;
  }
}

// Notification event types
export type NotificationEvent =
  | 'claim_submitted'
  | 'claim_assigned'
  | 'claim_status_changed'
  | 'new_message'
  | 'sla_warning'
  | 'sla_breached';

/**
 * Send a notification to a subscriber
 */
export async function sendNotification(
  subscriberId: string,
  event: NotificationEvent,
  payload: Record<string, string | number | boolean>,
  options?: {
    email?: string;
    firstName?: string;
    lastName?: string;
    locale?: string;
  }
) {
  const client = getNovuClient();

  // Skip notification if Novu is not configured
  if (!client) {
    console.debug(`Skipping notification [${event}] - Novu not configured`);
    return { success: false, error: 'Novu not configured' };
  }

  try {
    // First, identify/update the subscriber
    if (options?.email || options?.firstName) {
      await client.subscribers.identify(subscriberId, {
        email: options.email,
        firstName: options.firstName,
        lastName: options.lastName,
        locale: options.locale,
      });
    }

    // Trigger the notification workflow
    const response = await client.trigger(event, {
      to: {
        subscriberId,
        email: options?.email,
      },
      payload,
    });

    return { success: true, transactionId: response.data?.data?.transactionId };
  } catch (error) {
    console.error(`Failed to send notification [${event}]:`, error);
    return { success: false, error: 'Failed to send notification' };
  }
}

/**
 * Notify member about claim submission
 */
export async function notifyClaimSubmitted(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string; category: string }
) {
  sendClaimSubmittedEmail(userEmail, claim).catch(error =>
    console.error('Failed to send claim submitted email:', error)
  );

  return sendNotification(
    userId,
    'claim_submitted',
    {
      claimId: claim.id,
      claimTitle: claim.title,
      category: claim.category,
    },
    { email: userEmail }
  );
}

/**
 * Notify agent about new claim assignment
 */
export async function notifyClaimAssigned(
  agentId: string,
  agentEmail: string,
  claim: { id: string; title: string },
  agentName: string
) {
  sendClaimAssignedEmail(agentEmail, claim, agentName).catch(error =>
    console.error('Failed to send claim assigned email:', error)
  );

  return sendNotification(
    agentId,
    'claim_assigned',
    {
      claimId: claim.id,
      claimTitle: claim.title,
      agentName,
    },
    { email: agentEmail }
  );
}

/**
 * Notify member about claim status change
 */
export async function notifyStatusChanged(
  userId: string,
  userEmail: string,
  claim: { id: string; title: string },
  oldStatus: string,
  newStatus: string
) {
  sendStatusChangedEmail(userEmail, claim, oldStatus, newStatus).catch(error =>
    console.error('Failed to send status change email:', error)
  );

  return sendNotification(
    userId,
    'claim_status_changed',
    {
      claimId: claim.id,
      claimTitle: claim.title,
      oldStatus,
      newStatus,
    },
    { email: userEmail }
  );
}

/**
 * Notify user about new message on their claim
 */
export async function notifyNewMessage(
  recipientId: string,
  recipientEmail: string,
  claim: { id: string; title: string },
  senderName: string,
  messagePreview: string
) {
  sendNewMessageEmail(recipientEmail, claim, senderName, messagePreview).catch(error =>
    console.error('Failed to send new message email:', error)
  );

  return sendNotification(
    recipientId,
    'new_message',
    {
      claimId: claim.id,
      claimTitle: claim.title,
      senderName,
      messagePreview: messagePreview.substring(0, 100),
    },
    { email: recipientEmail }
  );
}

// Note: Preference management will be implemented once Novu workflows are configured
// in the Novu dashboard. The SDK methods require workflow IDs that are defined there.
