import {
  processAnnualReports,
  processEmailSequences,
  processSeasonalCampaigns,
} from '@/lib/cron-service';
import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const secret = searchParams.get('secret');

  if (secret !== process.env.CRON_SECRET) {
    return new NextResponse('Unauthorized', { status: 401 });
  }

  try {
    const results = await Promise.all([
      processEmailSequences(),
      processSeasonalCampaigns(),
      processAnnualReports(),
    ]);

    return NextResponse.json({
      success: true,
      sequences: results[0],
      seasonal: results[1],
      annual: results[2],
    });
  } catch (error) {
    console.error('Engagement CRON failed:', error);
    return NextResponse.json({ success: false, error: 'Internal server error' }, { status: 500 });
  }
}
