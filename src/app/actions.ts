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

import { getDailyId } from '@/lib/puzzles';

function getDailyKey() {
  const today = getDailyId();
  return `apex_global_daily_${today}`;
}

async function getUserHighScore(key: string, playerId: string): Promise<number> {
  try {
    // We check all difficulty labels for this player ID to find their max score
    // The member IDs are "safeName:playerId:difficulty"
    // Since we don't know the safeName used previously, we have to be careful.
    // However, the current system uses baseIdent = `${safeName}:${playerId}`
    // Let's assume the name is consistent for now as per the existing logic.
    // To truly find by playerId, we'd need a different data structure, 
    // but we'll stick to the current one and search common suffixes.
    
    // Actually, the current logic removes `${baseIdent}:E`, etc. 
    // So we can try to find the score for the current baseIdent.
    return 0; // Default if not found
  } catch (err) {
    return 0;
  }
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

    const key = isDaily ? getDailyKey() : LEADERBOARD_ALLTIME_KEY;

    // Fetch existing scores for all difficulty variants of this player
    const existingScores = await kv.zmscore(key, [
      `${baseIdent}:E`,
      `${baseIdent}:N`,
      `${baseIdent}:H`,
      `${baseIdent}:D`
    ]);

    const currentMax = existingScores ? Math.max(0, ...existingScores.filter((s): s is number => s !== null)) : 0;

    if (score > currentMax) {
      // New High Score! 
      // Remove old entries for this player (all difficulties) to keep leaderboard clean
      await kv.zrem(key, `${baseIdent}:E`, `${baseIdent}:N`, `${baseIdent}:H`, `${baseIdent}:D`);
      await kv.zadd(key, { score, member: memberId });
      
      if (isDaily) {
        await kv.expire(key, 172800); // 48 hours auto-expiry
        const countDaily = await kv.zcard(key);
        if (countDaily > 20) await kv.zremrangebyrank(key, 0, -21);
      } else {
        const countAllTime = await kv.zcard(key);
        if (countAllTime > 20) await kv.zremrangebyrank(key, 0, -21);
      }
      return { success: true, newHighScore: true };
    }

    // Not a new high score
    return { success: true, newHighScore: false };
  } catch (err) {
    console.error('Failed to submit score:', err);
    return { success: false, error: 'Database error' };
  }
}

export async function recordWordStats(words: string[], rootWord?: string, totalGridWords?: number) {
  try {
    const pipeline = kv.pipeline();
    
    // Increment total games counter
    pipeline.incr('apex_global_total_games');
    
    // Increment find count for each word
    words.forEach(word => {
      pipeline.hincrby('apex_global_word_finds', word.toUpperCase(), 1);
    });
    
    // Track root word difficulty
    if (rootWord && totalGridWords) {
      const rootUpper = rootWord.toUpperCase();
      pipeline.hincrby('apex_global_root_total_children', rootUpper, totalGridWords);
      pipeline.hincrby('apex_global_root_found_children', rootUpper, words.length);
    }
    
    await pipeline.exec();
  } catch (err) {
    console.error('Failed to record word stats:', err);
  }
}

export async function recordWordAppearances(words: string[]) {
  try {
    const pipeline = kv.pipeline();
    words.forEach(word => {
      pipeline.hincrby('apex_global_word_appearances', word.toUpperCase(), 1);
    });
    await pipeline.exec();
  } catch (err) {
    console.error('Failed to record word appearances:', err);
  }
}

export type WordConsensus = {
  finds: number;
  appearances: number;
  rate: number;
};

export async function getConsensusData(words: string[]): Promise<Record<string, WordConsensus>> {
  try {
    const upperWords = words.map(w => w.toUpperCase());
    // hmget returns an array of values for the given keys
    const finds = await kv.hmget('apex_global_word_finds', ...upperWords) as unknown as (number | null)[];
    const apps = await kv.hmget('apex_global_word_appearances', ...upperWords) as unknown as (number | null)[];
    
    const results: Record<string, WordConsensus> = {};
    upperWords.forEach((word, i) => {
      const f = Number(finds[i] || 0);
      const a = Number(apps[i] || 0);
      results[word] = {
        finds: f,
        appearances: a,
        rate: a > 0 ? f / a : 0
      };
    });
    return results;
  } catch (err) {
    console.error('Failed to get consensus data:', err);
    return {};
  }
}

// Global server puzzle generation to handle consensus
import { Difficulty, Puzzle, ROOT_WORDS, GRID_CAP, isValidAnagram, xmur3, mulberry32, getPuzzleWithRng, tier1, tier2, tier3, tier4 } from '@/lib/puzzles';

export async function getGamePuzzle(difficulty: Difficulty = 'normal'): Promise<Puzzle> {
  // We'll perform the root word selection here to keep it async and fetch consensus
  const pool = ROOT_WORDS[difficulty];
  const cap = GRID_CAP[difficulty];
  const allTiers = [...(tier1 as string[]), ...(tier2 as string[]), ...(tier3 as string[]), ...(tier4 as string[])];

  let puzzle: Puzzle | null = null;
  while (!puzzle) {
    const rootWord = pool[Math.floor(Math.random() * pool.length)];
    const rootLetters = rootWord.split('');
    
    // Find potential words to check consensus
    const validAnagrams = allTiers.filter(w => isValidAnagram(w, rootLetters));
    const uniquePotential = Array.from(new Set(validAnagrams));
    
    const consensus = await getConsensusData(uniquePotential);
    
    puzzle = getPuzzleWithRng(Math.random, difficulty, consensus);
  }

  // Record appearances for the generated puzzle words (Box words)
  await recordWordAppearances(puzzle.validWords);
  
  return puzzle;
}

export async function getDailyGamePuzzle(dateStr?: string): Promise<Puzzle> {
  const actualDateStr = dateStr || getDailyId();
  const seedGen = xmur3(actualDateStr);
  const seed = seedGen();
  const rng = mulberry32(seed);
  
  const difficulty: Difficulty = 'normal'; // Daily is always normal
  const pool = ROOT_WORDS[difficulty];
  const allTiers = [...(tier1 as string[]), ...(tier2 as string[]), ...(tier3 as string[]), ...(tier4 as string[])];

  let puzzle: Puzzle | null = null;
  while (!puzzle) {
    const rootWord = pool[Math.floor(rng() * pool.length)];
    const rootLetters = rootWord.split('');
    
    const validAnagrams = allTiers.filter(w => isValidAnagram(w, rootLetters));
    const uniquePotential = Array.from(new Set(validAnagrams));
    
    const consensus = await getConsensusData(uniquePotential);
    
    puzzle = getPuzzleWithRng(rng, difficulty, consensus);
  }

  // Record appearances for Daily Trial too
  await recordWordAppearances(puzzle.validWords);
  
  return puzzle;
}

export async function getWordRarity(words: string[]): Promise<Record<string, number>> {
  try {
    const totalGames = await kv.get<number>('apex_global_total_games') || 1;
    const findCounts = await kv.hmget('apex_global_word_finds', ...words.map(w => w.toUpperCase())) as unknown as (number | null)[];
    
    const rarities: Record<string, number> = {};
    words.forEach((word, idx) => {
      const count = Number(findCounts[idx] || 0);
      rarities[word.toUpperCase()] = count / totalGames;
    });
    
    return rarities;
  } catch (err) {
    console.error('Failed to get word rarity:', err);
    return {};
  }
}
