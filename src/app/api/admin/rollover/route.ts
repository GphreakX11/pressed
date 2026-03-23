import { NextResponse } from 'next/server';
import { awardDailyWinner } from '@/app/actions';
import { getDailyId } from '@/lib/puzzles';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    let targetDate = searchParams.get('date');

    if (!targetDate) {
      // Logic: Target "Yesterday" (Today - 1 day)
      const todayStr = getDailyId();
      const d = new Date(todayStr + 'T12:00:00Z');
      d.setUTCDate(d.getUTCDate() - 1);
      targetDate = d.toISOString().split('T')[0];
    }

    console.log(`[Admin API] Triggering rollover for date: ${targetDate} (FORCED)`);
    const result = await awardDailyWinner(targetDate, true);

    if (result.success) {
      return NextResponse.json({ 
        success: true, 
        message: `Champion Awarded for ${targetDate}: ${result.winner}` 
      });
    } else {
      return NextResponse.json({ 
        success: false, 
        error: result.error 
      }, { status: 400 });
    }
  } catch (err) {
    console.error('[Admin API] Rollover error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}

// Support POST as well for flexibility (cron usually uses GET or POST)
export async function POST(request: Request) {
  return GET(request);
}
