import { NextRequest, NextResponse } from 'next/server';
import { registerMemberCore } from '@/lib/actions/agent/register-member';
import { auth } from '@/lib/auth';
import { z } from 'zod';

const registerSchema = z.object({
  email: z.string().email(),
  name: z.string().min(2),
  role: z.enum(['user', 'agent']),
  password: z.string().min(6),
  phone: z.string().optional(),
});

export async function POST(req: NextRequest) {
  try {
    const session = await auth.api.getSession({
      headers: req.headers,
    });
    if (!session) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const validated = registerSchema.safeParse(body);

    if (!validated.success) {
      return NextResponse.json(
        {
          error: 'Validation failed',
          details: validated.error.flatten().fieldErrors,
        },
        { status: 400 }
      );
    }

    // Convert form data to FormData for the core function
    const formData = new FormData();
    formData.append('fullName', validated.data.name);
    formData.append('email', validated.data.email);
    formData.append('role', validated.data.role);
    formData.append('password', validated.data.password);
    if (validated.data.phone) {
      formData.append('phone', validated.data.phone);
    }

    const result = await registerMemberCore(
      { id: session.user.id, name: session.user.name },
      'default-tenant', // Use default tenant for now
      formData
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Registration API error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
