import { NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: 'This endpoint has been retired. Use the canonical registration flow.' },
    { status: 410 }
  );
}
