import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database';
import { userNotificationPreferences } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { headers } from 'next/headers';
import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Get user preferences or return defaults
    const [preferences] = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, session.user.id))
      .limit(1);

    if (!preferences) {
      // Return default preferences
      return NextResponse.json({
        emailClaimUpdates: true,
        emailMarketing: false,
        emailNewsletter: true,
        pushClaimUpdates: true,
        pushMessages: true,
        inAppAll: true,
      });
    }

    return NextResponse.json({
      emailClaimUpdates: preferences.emailClaimUpdates,
      emailMarketing: preferences.emailMarketing,
      emailNewsletter: preferences.emailNewsletter,
      pushClaimUpdates: preferences.pushClaimUpdates,
      pushMessages: preferences.pushMessages,
      inAppAll: preferences.inAppAll,
    });
  } catch (error) {
    console.error('Error fetching notification preferences:', error);
    return NextResponse.json({ error: 'Failed to fetch preferences' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });

    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    let body: {
      emailClaimUpdates: boolean;
      emailMarketing: boolean;
      emailNewsletter: boolean;
      pushClaimUpdates: boolean;
      pushMessages: boolean;
      inAppAll: boolean;
    };

    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
    }

    // Validate the request body
    const {
      emailClaimUpdates,
      emailMarketing,
      emailNewsletter,
      pushClaimUpdates,
      pushMessages,
      inAppAll,
    } = body;

    // Check if preferences exist
    const [existing] = await db
      .select()
      .from(userNotificationPreferences)
      .where(eq(userNotificationPreferences.userId, session.user.id))
      .limit(1);

    if (existing) {
      // Update existing preferences
      await db
        .update(userNotificationPreferences)
        .set({
          emailClaimUpdates,
          emailMarketing,
          emailNewsletter,
          pushClaimUpdates,
          pushMessages,
          inAppAll,
          updatedAt: new Date(),
        })
        .where(eq(userNotificationPreferences.userId, session.user.id));
    } else {
      // Create new preferences
      await db.insert(userNotificationPreferences).values({
        id: nanoid(),
        userId: session.user.id,
        emailClaimUpdates,
        emailMarketing,
        emailNewsletter,
        pushClaimUpdates,
        pushMessages,
        inAppAll,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('Error saving notification preferences:', error);
    return NextResponse.json({ error: 'Failed to save preferences' }, { status: 500 });
  }
}
