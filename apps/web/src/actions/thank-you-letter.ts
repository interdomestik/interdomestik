'use server';

import { sendEmail } from '@/lib/email';
import { renderThankYouLetterEmail, ThankYouLetterParams } from '@/lib/email/thank-you-letter';
import QRCode from 'qrcode';

const DEFAULT_APP_URL =
  process.env.NEXT_PUBLIC_APP_URL || process.env.BETTER_AUTH_URL || 'http://localhost:3000';

/**
 * Generate a QR code as a data URL for the member portal
 */
async function generateMemberQRCode(memberNumber: string): Promise<string> {
  const dashboardUrl = `${DEFAULT_APP_URL}/member?ref=${memberNumber}`;
  try {
    const qrDataUrl = await QRCode.toDataURL(dashboardUrl, {
      width: 200,
      margin: 2,
      color: {
        dark: '#0f766e',
        light: '#ffffff',
      },
    });
    return qrDataUrl;
  } catch {
    console.error('Failed to generate QR code');
    return '';
  }
}

/**
 * Send the Thank-you Letter email to a new member
 */
export async function sendThankYouLetter(params: {
  email: string;
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  memberSince: Date;
  expiresAt: Date;
  locale?: 'en' | 'sq';
}): Promise<{ success: boolean; error?: string }> {
  try {
    // Generate QR code
    const qrCodeDataUrl = await generateMemberQRCode(params.memberNumber);

    // Format dates
    const dateFormatter = new Intl.DateTimeFormat(params.locale === 'sq' ? 'sq-AL' : 'en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });

    const letterParams: ThankYouLetterParams = {
      memberName: params.memberName,
      memberNumber: params.memberNumber,
      planName: params.planName,
      planPrice: params.planPrice,
      planInterval: params.planInterval,
      memberSince: dateFormatter.format(params.memberSince),
      expiresAt: dateFormatter.format(params.expiresAt),
      qrCodeDataUrl,
      locale: params.locale || 'en',
    };

    const emailContent = renderThankYouLetterEmail(letterParams);

    // Generate PDF
    const { generateThankYouPDF } = await import('@/lib/pdf/thank-you-letter');
    const pdfBuffer = await generateThankYouPDF(letterParams);

    // Send email
    await sendEmail(
      params.email,
      {
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text,
      },
      {
        attachments: [
          {
            filename: `Interdomestik-Membership-${params.memberNumber}.pdf`,
            content: pdfBuffer,
          },
        ],
      }
    );

    console.log(`[ThankYouLetter] Sent to ${params.email} (${params.memberNumber})`);
    return { success: true };
  } catch (error) {
    console.error('[ThankYouLetter] Failed to send:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Preview the Thank-you Letter HTML (for testing/admin preview)
 */
export async function previewThankYouLetter(params: {
  memberName: string;
  memberNumber: string;
  planName: string;
  planPrice: string;
  planInterval: string;
  locale?: 'en' | 'sq';
}): Promise<{ html: string; text: string }> {
  const qrCodeDataUrl = await generateMemberQRCode(params.memberNumber);

  const now = new Date();
  const oneYear = new Date(now.getTime() + 365 * 24 * 60 * 60 * 1000);

  const dateFormatter = new Intl.DateTimeFormat(params.locale === 'sq' ? 'sq-AL' : 'en-US', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  const letterParams: ThankYouLetterParams = {
    memberName: params.memberName,
    memberNumber: params.memberNumber,
    planName: params.planName,
    planPrice: params.planPrice,
    planInterval: params.planInterval,
    memberSince: dateFormatter.format(now),
    expiresAt: dateFormatter.format(oneYear),
    qrCodeDataUrl,
    locale: params.locale || 'en',
  };

  return renderThankYouLetterEmail(letterParams);
}

/**
 * Admin Action: Resend Welcome Email to a user
 */
export async function resendWelcomeEmail(userId: string) {
  const { db } = await import('@interdomestik/database/db');
  const { eq, desc } = await import('drizzle-orm');
  const { user, subscriptions } = await import('@interdomestik/database/schema');

  const userData = await db.query.user.findFirst({
    where: eq(user.id, userId),
  });

  if (!userData) {
    return { success: false, error: 'User not found' };
  }

  // Find active subscription
  const subscription = await db.query.subscriptions.findFirst({
    where: eq(subscriptions.userId, userId),
    orderBy: [desc(subscriptions.createdAt)],
    with: {
      plan: true,
    },
  });

  // Defaults if no subscription found (e.g. manual add)
  const planName = subscription?.plan?.name || subscription?.planId || 'Membership';
  const planPriceValue = subscription?.plan?.price ? subscription.plan.price : '20.00';
  const planPrice = `€${planPriceValue}`;
  const planInterval = subscription?.plan?.interval || 'year';

  const memberSince = userData.createdAt || new Date();
  const expiresAt = subscription?.currentPeriodEnd
    ? new Date(subscription.currentPeriodEnd)
    : new Date(new Date().getTime() + 365 * 24 * 60 * 60 * 1000);

  return sendThankYouLetter({
    email: userData.email,
    memberName: userData.name,
    memberNumber: userData.memberNumber || `M-${userId.slice(0, 8).toUpperCase()}`,
    planName,
    planPrice,
    planInterval,
    memberSince,
    expiresAt,
    locale: 'en', // Default to EN for admin resend, or could infer from user prefs
  });
}
