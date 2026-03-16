'use server';

import { kv } from '@vercel/kv';

export type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
  date: number;
  difficulty?: string;
};

const LEADERBOARD_ALLTIME_KEY = 'apex_global_alltime';

function getDailyKey() {
  const today = new Date().toISOString().split('T')[0];
  return `apex_global_daily_${today}`;
}

export async function getTopScores(type: 'daily' | 'alltime' = 'alltime'): Promise<LeaderboardEntry[]> {
  try {
    const key = type === 'daily' ? getDailyKey() : LEADERBOARD_ALLTIME_KEY;
    const results = await kv.zrange(key, 0, 9, { rev: true, withScores: true });
    
    const entries: LeaderboardEntry[] = [];
    
    for (let i = 0; i < results.length; i += 2) {
      const memberStr = results[i] as string;
      const score = Number(results[i + 1]);
      const parts = memberStr.split(':');
      const name = parts[0] || 'Unknown';
      const playerId = parts[1] || 'Temp';
      const difficulty = parts.length > 2 ? parts[2] : 'N';
      
      entries.push({
        rank: entries.length + 1,
        name,
        score,
        date: Date.now(), // No longer parsed from string
        difficulty
      });
    }
    
    return entries;
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
    return [];
  }
}

export async function submitScore(name: string, playerId: string, score: number, difficultyLabel: string = 'N', isDaily: boolean = false) {
  try {
    const cleanName = name.trim().substring(0, 12) || 'ANONYMOUS';
    const safeName = cleanName.replace(/:/g, '');
    const memberId = `${safeName}:${playerId}:${difficultyLabel}`;
    const baseIdent = `${safeName}:${playerId}`;

    if (isDaily) {
      // Daily Trial — only goes to the daily key. Never touches all-time.
      const dailyKey = getDailyKey();
      await kv.zrem(dailyKey, `${baseIdent}:E`, `${baseIdent}:N`, `${baseIdent}:H`, `${baseIdent}:D`);
      await kv.zadd(dailyKey, { score, member: memberId });
      await kv.expire(dailyKey, 172800); // 48 hours auto-expiry
      const countDaily = await kv.zcard(dailyKey);
      if (countDaily > 20) await kv.zremrangebyrank(dailyKey, 0, -21);
    } else {
      // Standard / Random mode — only goes to the Hall of Fame (all-time). Never touches daily.
      await kv.zrem(LEADERBOARD_ALLTIME_KEY, `${baseIdent}:E`, `${baseIdent}:N`, `${baseIdent}:H`, `${baseIdent}:D`);
      await kv.zadd(LEADERBOARD_ALLTIME_KEY, { score, member: memberId });
      const countAllTime = await kv.zcard(LEADERBOARD_ALLTIME_KEY);
      if (countAllTime > 20) await kv.zremrangebyrank(LEADERBOARD_ALLTIME_KEY, 0, -21);
    }

    return { success: true };
  } catch (err) {
    console.error('Failed to submit score:', err);
    return { success: false, error: 'Database error' };
  }
}
