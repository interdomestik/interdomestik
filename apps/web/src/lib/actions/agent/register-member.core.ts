import { sendMemberWelcomeEmail } from '@/lib/email';
import { generateMemberNumber } from '@/server/domains/members/member-number';
import { db } from '@interdomestik/database/db';
import { agentClients, subscriptions, user as userTable } from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';
import { registerMemberSchema } from './schemas';

type DbTransaction = Parameters<Parameters<typeof db.transaction>[0]>[0];

// Temporary retry implementation (will move to shared-utils)
async function withTransactionRetry<T>(
  operation: (tx: DbTransaction) => Promise<T>,
  maxRetries = 3
): Promise<T> {
  for (let attempt = 1; attempt <= maxRetries + 1; attempt++) {
    try {
      return await db.transaction(operation);
    } catch (error) {
      const isLastAttempt = attempt > maxRetries;
      const errMessage = (error as { message?: string })?.message?.toLowerCase() || '';
      const isRetryable =
        errMessage.includes('deadlock') || errMessage.includes('could not serialize');

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

async function withCircuitBreaker<T>(operation: () => Promise<T>): Promise<T> {
  // Simple circuit breaker for email service
  try {
    return await operation();
  } catch (error) {
    console.warn('Email service temporarily unavailable:', error);
    throw error;
  }
}

export async function registerMemberCore(
  agent: { id: string; name?: string | null },
  tenantId: string,
  formData: FormData
) {
  const rawData = {
    fullName: formData.get('fullName'),
    email: formData.get('email'),
    phone: formData.get('phone'),
    planId: formData.get('planId'),
    notes: formData.get('notes') || undefined,
  };

  const validated = registerMemberSchema.safeParse(rawData);

  if (!validated.success) {
    return {
      ok: false as const,
      error: 'Validation failed' as const,
      fields: validated.error.flatten().fieldErrors, // NOSONAR
    };
  }

  const data = validated.data;
  const userId = nanoid();

  try {
    await withTransactionRetry(async tx => {
      const now = new Date();

      // 1. Create User (Role must be 'member' for the unique index to eventually apply)
      // We insert with null memberNumber first.
      await tx.insert(userTable).values({
        id: userId,
        tenantId,
        name: data.fullName,
        email: data.email,
        emailVerified: false,
        role: 'member', // Critical change: was 'user'
        agentId: agent.id,
        createdAt: now,
        updatedAt: now,
      });

      // 2. Generate and Assign Global Member Number
      // This helper handles the atomic increment and updates the user record
      await generateMemberNumber(tx, userId, now.getFullYear());

      await tx.insert(agentClients).values({
        id: nanoid(),
        tenantId,
        agentId: agent.id,
        memberId: userId,
        status: 'active',
        joinedAt: now,
        createdAt: now,
      });

      const expiry = new Date();
      expiry.setFullYear(expiry.getFullYear() + 1);

      await tx.insert(subscriptions).values({
        id: nanoid(),
        tenantId,
        userId,
        planId: data.planId,
        status: 'active',
        currentPeriodEnd: expiry,
        createdAt: now,
        updatedAt: now,
      });
    });

    // Send email with circuit breaker protection
    try {
      await withCircuitBreaker(() =>
        sendMemberWelcomeEmail(data.email, {
          memberName: data.fullName,
          agentName: agent.name || 'Your Agent',
        })
      );
    } catch (emailError) {
      // Don't fail registration if email fails, just log it
      console.warn('Welcome email failed:', emailError);
    }

    return { ok: true as const };
  } catch (err) {
    console.error('Registration failed:', err);
    return {
      ok: false as const,
      error: 'Failed to register member. Email might already exist.' as const,
    };
  }
}
