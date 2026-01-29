'use server';

import { auth } from '@/lib/auth';
import { db } from '@interdomestik/database/db';
import { user } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { z } from 'zod';

const schema = z.object({
  fullName: z.string().min(2),
  plateNumber: z.string().min(3),
  phoneNumber: z.string().min(9),
  email: z.string().email().optional().or(z.literal('')),
});

export async function registerMemberPOS(input: z.infer<typeof schema>) {
  const session = await auth.api.getSession({
    headers: await headers(),
  });

  if (!session?.user || session.user.role !== 'agent') {
    return { success: false, error: 'Unauthorized' };
  }

  const parsed = schema.safeParse(input);
  if (!parsed.success) {
    return { success: false, error: 'Invalid input' };
  }

  const { fullName, plateNumber, phoneNumber, email } = parsed.data;

  // Logic:
  // 1. Create User (if not exists)
  // 2. Assign Membership (Standard Plan)
  // 3. Record Payment (From Agent)

  // Placeholder implementation for prototype
  console.log('POS Registration:', {
    agent: session.user.id,
    customer: { fullName, plateNumber, phoneNumber },
    payment: '50.00 EUR',
  });

  // Mock success response
  // In real implementation: call createMember(), processPayment(), sendWhatsApp()

  return {
    success: true,
    data: {
      memberId: 'mem_123',
      phone: phoneNumber,
    },
  };
}
