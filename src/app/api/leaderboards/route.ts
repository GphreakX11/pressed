import { NextResponse } from 'next/server';
import { getTopScores } from '@/app/actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'alltime';
    
    if (!['daily', 'alltime', 'accuracy', 'tourney', 'champions', 'veteran'].includes(category)) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    const scores = await getTopScores(category as any);
    
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
