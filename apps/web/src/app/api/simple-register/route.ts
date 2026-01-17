import { registerUser } from '@/features/auth/registration.service';
import { NextRequest, NextResponse } from 'next/server';

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

    try {
      const user = await registerUser({ email, name, role });
      return NextResponse.json(
        {
          success: true,
          data: user,
        },
        { status: 201 }
      );
    } catch (error: any) {
      if (error.message === 'Email already exists') {
        return NextResponse.json({ error: 'Email already exists' }, { status: 409 });
      }
      throw error;
    }
  } catch (error) {
    console.error('Registration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
