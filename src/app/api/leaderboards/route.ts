import { NextResponse } from 'next/server';
import { kv } from '@vercel/kv';
import { getDailyId } from '@/lib/puzzles';
import { resolvePastDailyWinners } from '@/app/actions';

export const dynamic = 'force-dynamic';
export const revalidate = 0;

// Simple parser for Vercel KV zrange results with withScores: true
// Handles BOTH formats: [{member, score}, ...] AND [member, score, member, score, ...]
function parseZrangeResults(results: any[]): { member: string; score: number }[] {
  if (!results || results.length === 0) return [];

  const entries: { member: string; score: number }[] = [];

  for (let i = 0; i < results.length; i++) {
    const item = results[i];
    if (typeof item === 'object' && item !== null && 'member' in item) {
      // Object format: { member: "name:id:diff", score: 123 }
      entries.push({ member: String(item.member), score: Number(item.score) });
    } else if (typeof item === 'string') {
      // Interleaved format: ["name:id:diff", 123, "name2:id2:diff2", 456]
      const score = i + 1 < results.length ? Number(results[i + 1]) : 0;
      entries.push({ member: item, score });
      i++; // skip the score element
    }
  }

  return entries;
}

// Convert parsed entries into the LeaderboardEntry format the frontend expects
const GHOST_NAMES = ['ANONYMOUS', 'PLAYER', ''];

function toLeaderboardEntries(parsed: { member: string; score: number }[]) {
  return parsed
    .map((entry, idx) => {
      const parts = entry.member.split(':');
      const name = parts[0] || '';
      return {
        rank: idx + 1,
        name,
        playerId: parts[1] || '',
        score: entry.score,
        date: Date.now(),
        difficulty: parts.length > 2 ? parts[2] : undefined,
        isGold: false,
        silverWins: 0,
        isSniper: false,
        isSurvivalist: false,
        isVeteran: false,
      };
    })
    .filter(e => !GHOST_NAMES.includes(e.name.toUpperCase()))
    .map((e, i) => ({ ...e, rank: i + 1 })); // Re-rank after filtering
}

// Non-blocking enrichment: attach trophy badges to entries
// If this fails, entries are returned with default (false) badges
async function enrichWithBadges(entries: ReturnType<typeof toLeaderboardEntries>) {
  try {
    const [allTimeTop, accTop, tourneyTop, clearsTop] = await Promise.all([
      kv.zrange('apex_global_alltime', 0, 0, { rev: true }).catch(() => []),
      kv.zrange('apex_leaderboard_accuracy', 0, 0, { rev: true }).catch(() => []),
      kv.zrange('leaderboard_survivalist', 0, 0, { rev: true }).catch(() => []),
      kv.zrange('leaderboard_clears', 0, 0, { rev: true }).catch(() => []),
    ]);

    const extractId = (list: any[]) => {
      if (!list || list.length === 0) return null;
      const first = list[0];
      const str = typeof first === 'object' && first !== null && 'member' in first
        ? String(first.member) : String(first);
      return str.split(':')[1] || null;
    };

    const goldId = extractId(allTimeTop);
    const sniperId = extractId(accTop);
    const survId = extractId(tourneyTop);
    const vetId = extractId(clearsTop);

    // Fetch daily win counts for all players in the result set
    const playerIds = entries.map(e => e.playerId).filter(Boolean);
    let winCounts: (string | null)[] = [];
    if (playerIds.length > 0) {
      winCounts = (await kv.hmget('apex_user_daily_wins', ...playerIds)) as unknown as (string | null)[];
    }

    entries.forEach((e, i) => {
      e.isGold = goldId === e.playerId;
      e.isSniper = sniperId === e.playerId;
      e.isSurvivalist = survId === e.playerId;
      e.isVeteran = vetId === e.playerId;
      e.silverWins = Number(winCounts[i] || 0);
    });
  } catch (err) {
    console.error('[Leaderboard API] badge enrichment failed (non-fatal):', err);
  }
  return entries;
}

const REDIS_KEYS: Record<string, string> = {
  alltime: 'apex_global_alltime',
  sniper: 'apex_leaderboard_accuracy',
  survivalist: 'leaderboard_survivalist',
  veteran: 'leaderboard_clears',
};

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const category = searchParams.get('category') || 'alltime';

    console.log('[Leaderboard API] category =>', category);

    // Lazily resolve past daily winners (idempotent, uses Redis lock inside)
    if (category === 'champions' || category === 'daily') {
      await resolvePastDailyWinners();
    }

    // ── Champions: uses a hash, not a sorted set ──
    if (category === 'champions') {
      try {
        const allWins = (await kv.hgetall('apex_user_daily_wins')) as Record<string, string | number> | null;
        if (!allWins) return json([]);

        const sorted = Object.entries(allWins)
          .map(([pid, wins]) => ({ pid, wins: Number(wins) }))
          .filter((x) => x.wins > 0)
          .sort((a, b) => b.wins - a.wins)
          .slice(0, 10);

        const pids = sorted.map((s) => s.pid);
        let names: (string | null)[] = [];
        if (pids.length > 0) {
          names = (await kv.hmget('apex_player_names', ...pids)) as unknown as (string | null)[];
        }

        const entries = sorted
          .map((x, i) => ({
            rank: i + 1,
            name: names[i] || '',
            playerId: x.pid,
            score: x.wins,
            date: Date.now(),
            silverWins: x.wins,
            isGold: false,
            isSniper: false,
            isSurvivalist: false,
            isVeteran: false,
          }))
          .filter(e => e.name && !GHOST_NAMES.includes(e.name.toUpperCase()))
          .map((e, i) => ({ ...e, rank: i + 1 }));

        console.log('[Leaderboard API] champions results:', entries.length);
        return json(entries);
      } catch (err) {
        console.error('[Leaderboard API] champions error:', err);
        return json([]);
      }
    }

    // ── Daily: derive the key from getDailyId() ──
    if (category === 'daily') {
      try {
        const dailyId = getDailyId();
        const dailyKey = `apex_global_daily_${dailyId}`;
        console.log('[Leaderboard API] daily key =>', dailyKey);

        let results = await kv.zrange(dailyKey, 0, 9, { rev: true, withScores: true });
        if (results && !Array.isArray(results)) results = [results] as any;

        const parsed = parseZrangeResults(results || []);
        const entries = await enrichWithBadges(toLeaderboardEntries(parsed));

        console.log('[Leaderboard API] daily results:', entries.length);
        return json(entries);
      } catch (err) {
        console.error('[Leaderboard API] daily error:', err);
        return json([]);
      }
    }

    // ── Standard sorted-set categories: alltime, sniper, survivalist, veteran ──
    const redisKey = REDIS_KEYS[category];
    if (!redisKey) {
      return NextResponse.json({ error: 'Invalid category' }, { status: 400 });
    }

    try {
      let results = await kv.zrange(redisKey, 0, 9, { rev: true, withScores: true });
      if (results && !Array.isArray(results)) results = [results] as any;

      const parsed = parseZrangeResults(results || []);
      const entries = await enrichWithBadges(toLeaderboardEntries(parsed));

      console.log(`[Leaderboard API] ${category} results:`, entries.length);
      return json(entries);
    } catch (err) {
      console.error(`[Leaderboard API] ${category} error:`, err);
      return json([]);
    }
  } catch (err) {
    console.error('[Leaderboard API] top-level error:', err);
    return json([]);
  }
}

function json(data: any) {
  return NextResponse.json(data, {
    headers: {
      'Cache-Control': 'no-store, max-age=0',
      'CDN-Cache-Control': 'no-store',
      'Vercel-CDN-Cache-Control': 'no-store',
    },
  });
}
