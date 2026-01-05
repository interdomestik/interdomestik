import { NextRequest, NextResponse } from 'next/server';
import { nanoid } from 'nanoid';
import { db } from '@interdomestik/database/db';
import { user } from '@interdomestik/database/schema';
// Simple transaction retry for testing
async function withTransactionRetry<T>(
  operation: (tx: any) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await db.transaction(operation);
    } catch (error) {
      const isLastAttempt = attempt > maxRetries;
      const isRetryable =
        (error as any)?.message?.toLowerCase()?.includes('deadlock') ||
        (error as any)?.message?.toLowerCase()?.includes('could not serialize');

      if (isLastAttempt || !isRetryable) {
        throw error;
      }

      const delay = Math.min(100 * Math.pow(2, attempt - 1), 1000);
      console.warn(
        `Transaction failed (attempt ${attempt}/${maxRetries + 1}), retrying in ${delay}ms:`,
        error
      );
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  throw new Error('Max retries exceeded');
}

// Simple registration endpoint for testing
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { email, name, role = 'user', password } = body;

    // Basic validation
    if (!email || !name || !password || password.length < 6) {
      return NextResponse.json(
        { error: 'Invalid input: email, name, and password (min 6 chars) required' },
        { status: 400 }
      );
    }

    // Simple unique check
    const existing = await db.query.user.findFirst({
      where: (u, { eq }) => eq(u.email, email.toLowerCase()),
    });

    if (existing) {
      return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
    }

    // Create user with transaction retry
    const userId = nanoid();
    await withTransactionRetry(async tx => {
      await tx.insert(user).values({
        id: userId,
        tenantId: 'default-tenant', // Simplified for testing
        name: name.trim(),
        email: email.toLowerCase().trim(),
        emailVerified: false,
        role: role,
        memberNumber: `M${Date.now().toString().slice(-6)}`,
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    return NextResponse.json(
      {
        success: true,
        data: {
          id: userId,
          email: email.toLowerCase(),
          name: name.trim(),
          role: role,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
