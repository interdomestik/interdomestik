import { db } from '@interdomestik/database/db';
import { user } from '@interdomestik/database/schema';
import type { TenantId } from '@/lib/tenant/tenant-hosts';
import { nanoid } from 'nanoid';

// Simple transaction retry for testing
export async function withTransactionRetry<T>(
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

export async function registerUser(params: {
  email: string;
  name: string;
  role?: 'user' | 'admin' | 'super_admin' | 'staff' | 'agent' | 'branch_manager';
  tenantId: TenantId;
}) {
  const { email, name, role = 'user', tenantId } = params;

  // Simple unique check
  const existing = await db.query.user.findFirst({
    where: (u, { eq }) => eq(u.email, email.toLowerCase()),
  });

  if (existing) {
    throw new Error('Email already exists');
  }

  // Create user with transaction retry
  const userId = nanoid();
  await withTransactionRetry(async tx => {
    await tx.insert(user).values({
      id: userId,
      tenantId,
      name: name.trim(),
      email: email.toLowerCase().trim(),
      emailVerified: false,
      role: role,
      memberNumber: `M${Date.now().toString().slice(-6)}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  });

  return {
    id: userId,
    email: email.toLowerCase(),
    name: name.trim(),
    role: role,
  };
}
