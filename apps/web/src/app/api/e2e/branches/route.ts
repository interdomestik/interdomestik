import { db } from '@interdomestik/database/db';
import { branches } from '@interdomestik/database/schema';
import { eq } from 'drizzle-orm';
import { nanoid } from 'nanoid';
import { notFound } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * E2E-only route; do not enable in production.
 * This route is used by Playwright tests to set up and tear down data.
 */

export async function POST(req: NextRequest) {
  // 🛡️ SECURITY: Environment guard
  // Strictly disable in production builds, regardless of secrets.
  if (process.env.NODE_ENV !== 'test' && process.env.NODE_ENV !== 'development') {
    return notFound();
  }

  // 🛡️ SECURITY: Server-side enable check
  // The route is only active if E2E_API_SECRET is set in the server environment.
  if (!process.env.E2E_API_SECRET) {
    return notFound();
  }

  // 🛡️ SECURITY: Request authorization
  const secret = req.headers.get('x-e2e-secret');
  if (secret !== process.env.E2E_API_SECRET) {
    // Return 404 to avoid leaking existence
    return notFound();
  }

  const body = await req.json();
  const { action, name, code, isActive, pattern, tenantId } = body;

  try {
    if (action === 'cleanup') {
      if (!pattern) return new NextResponse('Missing pattern', { status: 400 });
      await db.delete(branches).where(eq(branches.code, pattern));
      return NextResponse.json({ success: true });
    }

    if (action === 'create') {
      if (!name || !code || !tenantId) return new NextResponse('Missing fields', { status: 400 });
      const id = nanoid();
      const slug = code.toLowerCase();

      await db.insert(branches).values({
        id,
        tenantId,
        name,
        code,
        slug,
        isActive: isActive ?? true,
      });
      return NextResponse.json({ success: true, id });
    }

    if (action === 'update') {
      if (!code || !name) return new NextResponse('Missing fields', { status: 400 });
      await db.update(branches).set({ name }).where(eq(branches.code, code));
      return NextResponse.json({ success: true });
    }

    if (action === 'delete') {
      if (!code) return new NextResponse('Missing code', { status: 400 });
      await db.delete(branches).where(eq(branches.code, code));
      return NextResponse.json({ success: true });
    }

    return new NextResponse('Unknown action', { status: 400 });
  } catch (error) {
    console.error('[E2E API] Error:', error);
    return new NextResponse('Internal Server Error', { status: 500 });
  }
}
