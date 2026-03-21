import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const rawTourney = await kv.zrange('leaderboard_survivalist', 0, 9, { rev: true, withScores: true });
    return NextResponse.json({ tourney: rawTourney });
  } catch (err: any) {
    return NextResponse.json({ error: err.message });
  }
}
