import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { getDailyId } from '@/lib/puzzles';

export const dynamic = 'force-dynamic';

export async function POST() {
  try {
    const ghostVariants = [
      'ANONYMOUS', 'Anonymous', 'anonymous',
      'ANONYMOUS:', 'Anonymous:', 'anonymous:',
    ];

    // All 6 leaderboard sorted-set keys
    const dailyId = getDailyId();
    const keys = [
      'apex_global_alltime',
      `apex_global_daily_${dailyId}`,
      'apex_leaderboard_accuracy',
      'leaderboard_survivalist',
      'leaderboard_clears',
    ];

    const results: Record<string, number> = {};

    for (const key of keys) {
      let removed = 0;
      // Fetch all members and remove any that start with ANONYMOUS
      const allMembers = await kv.zrange(key, 0, -1);
      if (allMembers && Array.isArray(allMembers)) {
        const toRemove: string[] = [];
        for (const member of allMembers) {
          const memberStr = typeof member === 'object' && member !== null && 'member' in member
            ? String((member as any).member) : String(member);
          
          const name = memberStr.split(':')[0];
          if (ghostVariants.includes(name) || name.toUpperCase() === 'ANONYMOUS') {
            toRemove.push(memberStr);
          }
        }
        if (toRemove.length > 0) {
          removed = await kv.zrem(key, ...toRemove) as number;
        }
      }
      results[key] = removed;
    }

    // Also scrub from the daily wins hash
    const allWins = await kv.hgetall('apex_user_daily_wins') as Record<string, any> | null;
    let hashScrubbed = 0;
    if (allWins) {
      for (const pid of Object.keys(allWins)) {
        if (pid.toUpperCase() === 'ANONYMOUS' || pid === '') {
          await kv.hdel('apex_user_daily_wins', pid);
          hashScrubbed++;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Ghost scrub complete',
      scrubbed: results,
      hashScrubbed
    });
  } catch (err) {
    console.error('Scrub error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
