'use server';

import { kv } from '@vercel/kv';

export type LeaderboardEntry = {
  rank: number;
  name: string;
  score: number;
  date: number;
  difficulty?: string;
  isGold?: boolean;
  silverWins?: number;
  isSniper?: boolean;
  isSurvivalist?: boolean;
  isVeteran?: boolean;
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

export async function resolvePastDailyWinners() {
  try {
    const today = getDailyId();
    
    // Calculate yesterday's date string
    const d = new Date(today + 'T12:00:00Z');
    d.setDate(d.getDate() - 1);
    const yesterday = d.toISOString().split('T')[0];
    
    const awardedKey = `apex_daily_awarded_${yesterday}`;
    // Lock effectively prevents multiple simultaneous executions
    const setSuccess = await kv.set(awardedKey, 'true', { nx: true, ex: 604800 });
    
    if (setSuccess) {
      const dailyKey = `apex_global_daily_${yesterday}`;
      const topEntry = await kv.zrange(dailyKey, 0, 0, { rev: true });
      if (topEntry && topEntry.length > 0) {
        const memberStr = topEntry[0] as string;
        const parts = memberStr.split(':');
        const playerId = parts[1];
        if (playerId) {
          await kv.hincrby('apex_user_daily_wins', playerId, 1);
        }
      }
    }
  } catch (err) {
    console.error('Failed to resolve past daily winners:', err);
  }
}

export async function getUserTrophies(playerId: string) {
  try {
    const [allTimeTop, accTop, tourneyTop, clearsTop, wins] = await Promise.all([
      kv.zrange(LEADERBOARD_ALLTIME_KEY, 0, 0, { rev: true }),
      kv.zrange('apex_leaderboard_accuracy', 0, 0, { rev: true }),
      kv.zrange('leaderboard_survivalist', 0, 0, { rev: true }),
      kv.zrange('leaderboard_clears', 0, 0, { rev: true }),
      kv.hget('apex_user_daily_wins', playerId)
    ]);
    
    const checkId = (topList: unknown[]) => topList && topList.length > 0 && (topList[0] as string).split(':')[1] === playerId;

    return { 
      isGold: checkId(allTimeTop), 
      silverWins: Number(wins || 0),
      isSniper: checkId(accTop),
      isSurvivalist: checkId(tourneyTop),
      isVeteran: checkId(clearsTop)
    };
  } catch (err) {
    return { isGold: false, silverWins: 0, isSniper: false, isSurvivalist: false, isVeteran: false };
  }
}

export async function getTopScores(type: 'daily' | 'alltime' | 'sniper' | 'survivalist' | 'champions' | 'veteran' = 'alltime'): Promise<LeaderboardEntry[]> {
  try {
    if (type === 'daily') await resolvePastDailyWinners();

    if (type === 'champions') {
      const allWins = await kv.hgetall('apex_user_daily_wins') as Record<string, string | number>;
      if (!allWins) return [];
      
      const arr = Object.keys(allWins).map(k => ({
         playerId: k,
         wins: Number(allWins[k])
      })).filter(x => x.wins > 0).sort((a, b) => b.wins - a.wins).slice(0, 10);
      
      const playerIds = arr.map(a => a.playerId);
      let names: (string | null)[] = [];
      if (playerIds.length > 0) {
        names = await kv.hmget('apex_player_names', ...playerIds) as unknown as (string | null)[];
      }

      return arr.map((x, i) => ({
         rank: i + 1,
         name: names[i] || 'PLAYER',
         score: x.wins,
         date: Date.now(),
         difficulty: undefined,
         silverWins: x.wins,
         isGold: false,
         isSniper: false,
         isSurvivalist: false,
         isVeteran: false
      }));
    }

    let key = LEADERBOARD_ALLTIME_KEY;
    if (type === 'daily') key = getDailyKey();
    if (type === 'sniper') key = 'apex_leaderboard_accuracy';
    if (type === 'survivalist') key = 'leaderboard_survivalist';
    if (type === 'veteran') key = 'leaderboard_clears';

    let results = await kv.zrange(key, 0, 9, { rev: true, withScores: true });
    
    // Failsafe: Vercel KV may unwrap single-element arrays into raw objects
    if (results && !Array.isArray(results) && typeof results === 'object') {
       results = [results] as any;
    }

    const [allTimeTop, accTop, tourneyTop, clearsTop] = await Promise.all([
      kv.zrange(LEADERBOARD_ALLTIME_KEY, 0, 0, { rev: true }),
      kv.zrange('apex_leaderboard_accuracy', 0, 0, { rev: true }),
      kv.zrange('leaderboard_survivalist', 0, 0, { rev: true }),
      kv.zrange('leaderboard_clears', 0, 0, { rev: true })
    ]);

    const getTopId = (topList: unknown[]) => topList && topList.length > 0 ? (topList[0] as string).split(':')[1] : null;
    const allTimeLeaderId = getTopId(allTimeTop);
    const sniperLeaderId = getTopId(accTop);
    const survLeaderId = getTopId(tourneyTop);
    const veteranLeaderId = getTopId(clearsTop);

    const entries: LeaderboardEntry[] = [];
    const playerIds: string[] = [];
    
    for (let i = 0; i < results.length; i++) {
      let memberStr = "";
      let score = 0;
      const item = results[i];
      
      if (typeof item === 'object' && item !== null && 'member' in item) {
        memberStr = String((item as any).member);
        score = Number((item as any).score);
      } else {
        memberStr = String(item);
        if (i + 1 < results.length) {
          score = Number(results[i + 1]);
          i++; // skip score field
        }
      }
      
      if (!memberStr) continue;

      const parts = memberStr.split(':');
      const name = parts[0] || 'Unknown';
      const playerId = parts[1] || 'Temp';
      const difficulty = parts.length > 2 ? parts[2] : 'N';
      
      playerIds.push(playerId);
      
      entries.push({
        rank: entries.length + 1,
        name,
        score,
        date: Date.now(), // No longer parsed from string
        difficulty: type === 'sniper' || type === 'survivalist' || type === 'veteran' ? undefined : difficulty,
        isGold: allTimeLeaderId === playerId,
        isSniper: sniperLeaderId === playerId,
        isSurvivalist: survLeaderId === playerId,
        isVeteran: veteranLeaderId === playerId,
        silverWins: 0 // Default, filled next
      });
    }
    
    if (playerIds.length > 0) {
      const winCounts = await kv.hmget('apex_user_daily_wins', ...playerIds) as unknown as (string | null)[];
      entries.forEach((e, i) => {
         e.silverWins = Number(winCounts[i] || 0);
      });
    }
    
    return entries;
  } catch (err) {
    console.error('Failed to fetch leaderboard:', err);
    return [];
  }
}

export async function submitScore(name: string, playerId: string, score: number, difficultyLabel: string = 'N', isDaily: boolean = false, boardsCleared: number = 0) {
  try {
    console.log('Game Over. Incoming Score Submission:', { name, playerId, score, difficultyLabel, isDaily, boardsCleared });

    // Ghost Clone Deadbolt: reject empty/anonymous/player handles
    const trimmedName = name?.trim() || '';
    if (!trimmedName || trimmedName.toUpperCase() === 'ANONYMOUS' || trimmedName.toUpperCase() === 'PLAYER') {
      console.log('BLOCKED: Invalid handle rejected:', trimmedName);
      return { success: false, error: 'Invalid handle' };
    }

    const cleanName = name.trim().substring(0, 12);
    const safeName = cleanName.replace(/:/g, '');
    const memberId = `${safeName}:${playerId}:${difficultyLabel}`;
    const baseIdent = `${safeName}:${playerId}`;

    // Get old handle to prevent duplication if name changes
    const oldName = await kv.hget('apex_player_names', playerId) as string | null;
    const oldBaseIdent = oldName ? `${oldName.replace(/:/g, '')}:${playerId}` : baseIdent;

    await kv.hset('apex_player_names', { [playerId]: safeName });

    if (boardsCleared > 0 && score > 0) {
      console.log('Executing ZADD for leaderboard_clears key: leaderboard_clears with score:', boardsCleared);
      await kv.zadd('leaderboard_clears', { score: boardsCleared, member: `${safeName}:${playerId}` });
    }

    const key = isDaily ? getDailyKey() : LEADERBOARD_ALLTIME_KEY;
    console.log('[submitScore] Key:', key, '| isDaily:', isDaily);

    // Fetch existing scores for all difficulty variants of this player (old and new name)
    const membersToMatch = [
      `${baseIdent}:E`, `${baseIdent}:N`, `${baseIdent}:H`, `${baseIdent}:D`,
      `${oldBaseIdent}:E`, `${oldBaseIdent}:N`, `${oldBaseIdent}:H`, `${oldBaseIdent}:D`
    ];
    const uniqueMembers = Array.from(new Set(membersToMatch));

    const existingScores = await kv.zmscore(key, uniqueMembers);
    
    let currentMax = 0;
    let bestDifficultyStr = difficultyLabel;
    
    if (existingScores) {
      existingScores.forEach((s, idx) => {
        if (s !== null && s > currentMax) {
          currentMax = s;
          // Extract the difficulty tag from the variant that held the high score
          bestDifficultyStr = uniqueMembers[idx].split(':')[2] || difficultyLabel;
        }
      });
    }

    const isPersonalBest = score > currentMax;
    console.log('[submitScore] currentMax:', currentMax, '| newScore:', score, '| isPersonalBest:', isPersonalBest, '| bestDiff:', bestDifficultyStr);

    // Get current top 2 leaders BEFORE we add the new score (to see if they conquer them)
    let currentLeaders = await kv.zrange(key, 0, 1, { rev: true, withScores: true });
    
    // Failsafe: Vercel KV unwrapping
    if (currentLeaders && !Array.isArray(currentLeaders) && typeof currentLeaders === 'object') {
      currentLeaders = [currentLeaders] as any;
    }

    let previousLeaderId: string | null = null;
    let previousLeaderScore = 0;
    let secondPlaceScore = 0;
    
    if (currentLeaders.length > 0) {
      const first = currentLeaders[0];
      if (typeof first === 'object' && first !== null && 'member' in first) {
        previousLeaderId = String((first as any).member).split(':')[1];
        previousLeaderScore = Number((first as any).score);
        if (currentLeaders.length > 1) {
          secondPlaceScore = Number((currentLeaders[1] as any).score);
        }
      } else {
        previousLeaderId = String(currentLeaders[0]).split(':')[1];
        previousLeaderScore = Number(currentLeaders[1]);
        if (currentLeaders.length >= 4) {
          secondPlaceScore = Number(currentLeaders[3]);
        }
      }
    }

    // ── ALWAYS clean up old variants and insert the score ──
    // Remove ALL old member variants for this player first
    await kv.zrem(key, ...uniqueMembers);
    
    // Insert the score — use the HIGHER of newScore vs currentMax
    const scoreToInsert = Math.max(score, currentMax);
    // If the new score is higher, use the current game's diff. If not, preserve the diff of the high score mode.
    const finalMemberIdToInsert = score >= currentMax ? memberId : `${safeName}:${playerId}:${bestDifficultyStr}`;
    
    console.log('[submitScore] ZADD key:', key, '| member:', finalMemberIdToInsert, '| score:', scoreToInsert);
    await kv.zadd(key, { score: scoreToInsert, member: finalMemberIdToInsert });
    
    if (isDaily) {
      await kv.expire(key, 172800); 
      const countDaily = await kv.zcard(key);
      if (countDaily > 25) await kv.zremrangebyrank(key, 0, -26);
      
      // Daily scores must ALSO be represented on the All-Time Hall of Fame
      // We do this synchronously to ensure the write completes before the function returns
      try {
        const alltimeExisting = await kv.zmscore(LEADERBOARD_ALLTIME_KEY, uniqueMembers);
        let alltimeMax = 0;
        let alltimeBestDiff = difficultyLabel;
        if (alltimeExisting) {
          alltimeExisting.forEach((s, idx) => {
            if (s !== null && s > alltimeMax) {
              alltimeMax = s;
              alltimeBestDiff = uniqueMembers[idx].split(':')[2] || difficultyLabel;
            }
          });
        }
        const scoreToInsertAlltime = Math.max(score, alltimeMax);
        const finalAlltimeMemberId = score >= alltimeMax ? memberId : `${safeName}:${playerId}:${alltimeBestDiff}`;
        
        console.log('[submitScore] Syncing Daily score to All-Time Hall of Fame:', { scoreToInsertAlltime, finalAlltimeMemberId });
        await kv.zrem(LEADERBOARD_ALLTIME_KEY, ...uniqueMembers);
        await kv.zadd(LEADERBOARD_ALLTIME_KEY, { score: scoreToInsertAlltime, member: finalAlltimeMemberId });
        const countAllTime = await kv.zcard(LEADERBOARD_ALLTIME_KEY);
        if (countAllTime > 100) await kv.zremrangebyrank(LEADERBOARD_ALLTIME_KEY, 0, -101);
      } catch (e) {
        console.error('[submitScore] All-time sync failed:', e);
      }
    } else {
      const countAllTime = await kv.zcard(key);
      if (countAllTime > 100) await kv.zremrangebyrank(key, 0, -101);
    }

    // ── True Rank Resolution ──
    // We just inserted finalMemberIdToInsert, so query it directly
    const verifiedRank = await kv.zrevrank(key, finalMemberIdToInsert);
    const isTopTen = verifiedRank !== null && verifiedRank <= 9;
    const humanRank = verifiedRank !== null ? verifiedRank + 1 : null;
    console.log('[submitScore] ZREVRANK result:', verifiedRank, '→ humanRank:', humanRank, '| isTopTen:', isTopTen);

    let rankStatus = 'NONE';
    if (isPersonalBest && previousLeaderId !== playerId && score > previousLeaderScore) {
       rankStatus = 'NEW_LEADER';
    } else if (isPersonalBest && previousLeaderId === playerId && currentLeaders.length >= 4 && score > secondPlaceScore) {
       rankStatus = 'STILL_LEADER';
    } else if (isTopTen) {
       rankStatus = 'TOP_TEN';
    } else if (isPersonalBest) {
       rankStatus = 'PERSONAL_BEST';
    }

    console.log('[submitScore] Final result:', { rankStatus, humanRank });

    return { 
      success: true, 
      rankStatus,
      rank: humanRank
    };
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

export async function getTournamentPuzzle(targetScore: number): Promise<Puzzle> {
  // Loop to find a puzzle that satisfies the minimum score threshold
  while (true) {
    const puzzle = await getGamePuzzle('normal');
    
    // Calculate absolute maximum base score possible natively
    let totalPossibleScore = 0;
    for (const word of puzzle.validWords) {
      totalPossibleScore += Math.floor(word.length * 10 * 1.2);
    }
    for (const word of puzzle.bonusWords) {
      totalPossibleScore += Math.floor(word.length * 10 * 1.2);
    }
    
    // Safety Valve: Total possible points must exceed target by at least 10%
    if (totalPossibleScore >= targetScore * 1.10) {
      return puzzle;
    }
    // Loop continues if it fails the safety check
  }
}

export async function recordTournamentRound(playerId: string, name: string, round: number) {
  try {
    const cleanName = name.trim().substring(0, 12) || 'ANONYMOUS';
    const safeName = cleanName.replace(/:/g, '');
    const memberId = `${safeName}:${playerId}`;

    const existing = await kv.hget('apex_user_tourney_rounds', playerId) as number | null;
    let newMax = false;
    if (!existing || round > Number(existing)) {
       await kv.hset('apex_user_tourney_rounds', { [playerId]: round });
       newMax = true;
    }
    
    // Natively sync to new global leaderboard_survivalist using ZADD whenever a game ends
    await kv.zadd('leaderboard_survivalist', { score: round, member: memberId });

    return { success: true, newMax };
  } catch (err) {
    console.error('Failed to record tournament round:', err);
    return { success: false, newMax: false };
  }
}

export async function submitGameStats(
  playerId: string, 
  name: string, 
  accuracyStats: { gamesWon: number, totalAccuracySum: number, gamesWithWordData: number }, 
  highestTournamentRound: number,
  highScore: number = 0
) {
  try {
    // 1. Plausibility Check
    if (highScore > 5000) {
      console.error(`[submitGameStats] REJECTED: Score ${highScore} exceeds plausibility threshold.`);
      return { success: false, error: 'Plausibility check failed' };
    }

    // Ghost Clone Deadbolt: reject empty/anonymous/player handles
    const trimmedName = name?.trim() || '';
    if (!trimmedName || trimmedName.toUpperCase() === 'ANONYMOUS' || trimmedName.toUpperCase() === 'PLAYER') {
      console.log('BLOCKED: Invalid background sync handle rejected:', trimmedName);
      return { success: false };
    }

    const cleanName = name.trim().substring(0, 12);
    const safeName = cleanName.replace(/:/g, '');
    const memberId = `${safeName}:${playerId}`;

    await kv.hset('apex_player_names', { [playerId]: safeName });

    const pipeline = kv.pipeline();

    // 2. High-Water Mark Resolution via ZADD GT (Greater Than)
    // Sniper (Accuracy) - Only if 25+ games
    if (accuracyStats.gamesWon >= 25 && accuracyStats.gamesWithWordData > 0) {
       const accuracy = Math.round(accuracyStats.totalAccuracySum / accuracyStats.gamesWithWordData);
       // @ts-ignore - Vercel KV supports GT/NX in options object
       pipeline.zadd('apex_leaderboard_accuracy', { score: accuracy, member: memberId }, { gt: true });
    }

    // Veteran (Clears)
    if (accuracyStats.gamesWon > 0) {
      // @ts-ignore
      pipeline.zadd('leaderboard_clears', { score: accuracyStats.gamesWon, member: memberId }, { gt: true });
    }

    // Survivalist (Tourney)
    if (highestTournamentRound > 0) {
       // @ts-ignore
       pipeline.zadd('leaderboard_survivalist', { score: highestTournamentRound, member: memberId }, { gt: true });
    }

    // All-Time Hall of Fame
    if (highScore > 0) {
      // Note: for Hall of Fame, the member ID includes the difficulty. 
      // Background sync uses 'N' (Normal) as a safe fallback if we don't know the original mode.
      const allTimeMemberId = `${safeName}:${playerId}:N`; 
      // @ts-ignore
      pipeline.zadd(LEADERBOARD_ALLTIME_KEY, { score: highScore, member: allTimeMemberId }, { gt: true });
    }

    await pipeline.exec();
    return { success: true };
  } catch (err) {
    console.error('Failed to submit game stats:', err);
    return { success: false };
  }
}

/**
 * NEW: Reconciliation helper to get current server-side stats for a player
 */
export async function getUserServerStats(playerId: string) {
  try {
    const name = await kv.hget('apex_player_names', playerId) as string || 'PLAYER';
    const safeName = name.replace(/:/g, '');
    
    // Check All-Time (we try all common difficulty suffixes)
    const variants = [
      `${safeName}:${playerId}:E`,
      `${safeName}:${playerId}:N`,
      `${safeName}:${playerId}:H`,
      `${safeName}:${playerId}:D`
    ];
    
    const [allTimeScores, veteranScore, survivalistScore] = await Promise.all([
      kv.zmscore(LEADERBOARD_ALLTIME_KEY, variants),
      kv.zscore('leaderboard_clears', `${safeName}:${playerId}`),
      kv.zscore('leaderboard_survivalist', `${safeName}:${playerId}`)
    ]);

    const highScore = allTimeScores ? Math.max(0, ...allTimeScores.filter((s): s is number => s !== null)) : 0;

    return {
      highScore,
      gamesWon: Number(veteranScore || 0),
      highestTournamentRound: Number(survivalistScore || 0)
    };
  } catch (err) {
    console.error('Failed to fetch server stats:', err);
    return { highScore: 0, gamesWon: 0, highestTournamentRound: 0 };
  }
}
