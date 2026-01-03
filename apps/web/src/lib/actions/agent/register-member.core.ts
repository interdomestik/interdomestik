import { sendMemberWelcomeEmail } from '@/lib/email';
import { generateMemberNumber } from '@/utils/member';
import { db } from '@interdomestik/database/db';
import { agentClients, subscriptions, user as userTable } from '@interdomestik/database/schema';
import { nanoid } from 'nanoid';
import { registerMemberSchema } from './schemas';

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
      fields: validated.error.flatten().fieldErrors,
    };
  }

  const data = validated.data;
  const userId = nanoid();

  try {
    await db.transaction(async tx => {
      await tx.insert(userTable).values({
        id: userId,
        tenantId,
        name: data.fullName,
        email: data.email,
        emailVerified: false,
        memberNumber: generateMemberNumber(),
        role: 'user',
        agentId: agent.id,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await tx.insert(agentClients).values({
        id: nanoid(),
        tenantId,
        agentId: agent.id,
        memberId: userId,
        status: 'active',
        joinedAt: new Date(),
        createdAt: new Date(),
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
        createdAt: new Date(),
        updatedAt: new Date(),
      });
    });

    await sendMemberWelcomeEmail(data.email, {
      memberName: data.fullName,
      agentName: agent.name || 'Your Agent',
    });

    return { ok: true as const };
  } catch (err) {
    console.error('Registration failed:', err);
    return {
      ok: false as const,
      error: 'Failed to register member. Email might already exist.' as const,
    };
  }
}
