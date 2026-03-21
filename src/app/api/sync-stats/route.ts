import { NextResponse } from 'next/server';
import { submitGameStats } from '@/app/actions';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { playerId, name, accuracyStats, highestTournamentRound } = body;
    
    if (!playerId || !name) {
      return NextResponse.json({ success: false, error: 'Missing credentials' }, { status: 400 });
    }

    const res = await submitGameStats(
      playerId, 
      name, 
      accuracyStats || { gamesWon: 0, totalAccuracySum: 0, gamesWithWordData: 0 }, 
      highestTournamentRound || 0
    );
    
    return NextResponse.json(res);
  } catch (err) {
    console.error('Sync API Error:', err);
    return NextResponse.json({ success: false, error: 'Internal Server Error' }, { status: 500 });
  }
}
