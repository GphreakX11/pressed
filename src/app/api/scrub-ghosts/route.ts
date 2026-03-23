import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { getDailyId } from '@/lib/puzzles';

export const dynamic = 'force-dynamic';

// Blocklist: names that should NEVER appear on leaderboards
const BLOCKED_NAMES = ['ANONYMOUS', 'PLAYER', 'TESTUSER', ''];

export async function GET() { return POST(); }

export async function POST() {
  try {
    const dailyId = getDailyId();
    const keys = [
      'apex_global_alltime',
      `apex_global_daily_${dailyId}`,
      'apex_leaderboard_accuracy',
      'leaderboard_survivalist',
      'leaderboard_clears',
    ];

    const results: Record<string, { removed: number; entries: string[] }> = {};

    for (const key of keys) {
      const toRemove: string[] = [];

      // Fetch ALL members from the sorted set
      const allMembers = await kv.zrange(key, 0, -1);
      if (allMembers && Array.isArray(allMembers)) {
        for (const member of allMembers) {
          // Handle both object format {member: "...", score: N} and plain string format
          let memberStr: string;
          if (typeof member === 'object' && member !== null && 'member' in member) {
            memberStr = String((member as any).member);
          } else {
            memberStr = String(member);
          }

          const name = memberStr.split(':')[0].trim();
          if (BLOCKED_NAMES.includes(name.toUpperCase()) || name === '') {
            toRemove.push(memberStr);
          }
        }
      }

      let removed = 0;
      if (toRemove.length > 0) {
        removed = await kv.zrem(key, ...toRemove) as number;
      }
      results[key] = { removed, entries: toRemove };
    }

    // Also scrub from the daily wins hash and player names hash
    let hashScrubbed = 0;
    const allWins = await kv.hgetall('apex_user_daily_wins') as Record<string, any> | null;
    if (allWins) {
      for (const pid of Object.keys(allWins)) {
        if (BLOCKED_NAMES.includes(pid.toUpperCase()) || pid === '') {
          await kv.hdel('apex_user_daily_wins', pid);
          hashScrubbed++;
        }
      }
    }

    const allNames = await kv.hgetall('apex_player_names') as Record<string, any> | null;
    let namesScrubbed = 0;
    if (allNames) {
      for (const [pid, name] of Object.entries(allNames)) {
        if (typeof name === 'string' && BLOCKED_NAMES.includes(name.toUpperCase())) {
          await kv.hdel('apex_player_names', pid);
          namesScrubbed++;
        }
      }
    }

    return NextResponse.json({ 
      success: true, 
      message: 'Ghost scrub complete',
      scrubbed: results,
      hashScrubbed,
      namesScrubbed,
    });
  } catch (err) {
    console.error('Scrub error:', err);
    return NextResponse.json({ success: false, error: String(err) }, { status: 500 });
  }
}
