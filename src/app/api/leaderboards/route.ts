import { NextResponse } from 'next/server';
import { getTopScores } from '@/app/actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('category') || 'alltime';
    
    console.log('API Hit: Fetching category ->', type);
    
    if (type === 'daily') {
      const { getDailyId } = await import('@/lib/puzzles');
      console.log('Daily ID generated for GET:', getDailyId());
    }

    if (!['daily', 'alltime', 'sniper', 'survivalist', 'champions', 'veteran'].includes(type)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    let scores;
    switch(type) {
      case 'daily':
        scores = await getTopScores('daily');
        break;
      case 'champions':
        scores = await getTopScores('champions');
        break;
      case 'alltime':
        scores = await getTopScores('alltime');
        break;
      case 'sniper':
        scores = await getTopScores('sniper');
        break;
      case 'survivalist':
        scores = await getTopScores('survivalist');
        break;
      case 'veteran':
        scores = await getTopScores('veteran');
        break;
      default:
        return NextResponse.json([]);
    }
    
    console.log('Redis Return Data:', scores);
    
    return NextResponse.json(scores, {
      headers: {
        'Cache-Control': 'no-store, max-age=0',
        'CDN-Cache-Control': 'no-store',
        'Vercel-CDN-Cache-Control': 'no-store'
      }
    });
  } catch (err) {
    console.error('API Leaderboards Error:', err);
    return NextResponse.json({ error: 'Failed to fetch leaderboard' }, { status: 500 });
  }
}
