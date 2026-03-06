import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  void req;

  return NextResponse.json(
    { error: 'This endpoint has been retired. Use the canonical registration flow.' },
    { status: 410 }
  );
}
