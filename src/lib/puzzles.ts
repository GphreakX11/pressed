import tier1 from './tier1_ef3k.json';
import tier2 from './tier2_google10k.json';
import tier3 from './tier3_google20k.json';
import tier4 from './tier4_enable1.json';

export { tier1, tier2, tier3, tier4 };

export type Difficulty = 'easy' | 'normal' | 'hard';

export type Puzzle = {
  sourceLetters: string[];
  validWords: string[];
  bonusWords: string[];
  bingoWord: string;
};

// Word profile constants
const VOWELS = new Set(['A','E','I','O','U']);
const POWER_LETTERS = new Set(['Q','X','Z','J','K']);

function countVowels(word: string): number {
  return word.split('').filter(c => VOWELS.has(c.toUpperCase())).length;
}
function hasPowerLetter(word: string): boolean {
  return word.split('').some(c => POWER_LETTERS.has(c.toUpperCase()));
}

// 6-letter roots for easy/normal (Tier 1 & Tier 2)
const ROOT_WORDS_EASY_NORMAL = Array.from(new Set([...(tier1 as string[]), ...(tier2 as string[])])).filter(w => w.length === 6);
// 6-letter roots for hard (Tier 3)
const ROOT_WORDS_HARD = (tier3 as string[]).filter(w => w.length === 6);

// Per-difficulty root pools
export const ROOT_WORDS: Record<Difficulty, string[]> = {
  // Easy: 3+ vowels -> lots of recognizable permutations
  easy:   ROOT_WORDS_EASY_NORMAL.filter(w => countVowels(w) >= 3),
  // Normal: 2-3 vowels -> standard mix
  normal: ROOT_WORDS_EASY_NORMAL.filter(w => { const v = countVowels(w); return v >= 2 && v <= 3; }),
  // Hard: <= 2 vowels OR contains a power letter
  hard:   ROOT_WORDS_HARD.filter(w => countVowels(w) <= 2 || hasPowerLetter(w)),
};

/**
 * Returns a date string formatted as YYYY-MM-DD that offsets cleanly to 3:00 AM EST.
 */
export function getDailyId(): string {
  const now = new Date();
  // We offset it by 3 hours back. If it's 2:59 AM EST, it will count as the previous day.
  // We use America/New_York (EST/EDT) explicitly.
  const threeHoursAgo = new Date(now.getTime() - (3 * 60 * 60 * 1000));
  
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  });
  
  const parts = formatter.formatToParts(threeHoursAgo);
  const year = parts.find(p => p.type === 'year')?.value;
  const month = parts.find(p => p.type === 'month')?.value;
  const day = parts.find(p => p.type === 'day')?.value;
  
  return `${year}-${month}-${day}`;
}

// Grid caps per difficulty
export const GRID_CAP: Record<Difficulty, number> = {
  easy:   8,
  normal: 12,
  hard:   15,
};

/**
 * Helper function to check if a dictionary word can be formed 
 * strictly using the available source letters (accounting for duplicates).
 */
export function isValidAnagram(word: string, sourceLetters: string[]): boolean {
  // Length Guard: Ensure words are at least 3 letters long.
  if (word.length < 3 || word.length > 6) return false;
  
  const sourceCounts: Record<string, number> = {};
  for (const char of sourceLetters) {
    const upper = char.toUpperCase();
    sourceCounts[upper] = (sourceCounts[upper] || 0) + 1;
  }

  const wordCounts: Record<string, number> = {};
  for (const char of word) {
    const upper = char.toUpperCase();
    wordCounts[upper] = (wordCounts[upper] || 0) + 1;
  }

  for (const char in wordCounts) {
    if (!sourceCounts[char] || wordCounts[char] > sourceCounts[char]) {
      return false;
    }
  }

  return true;
}

// PRNG utilities for seeded daily puzzles
export function xmur3(str: string) {
    for(var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    } return function() {
        h = Math.imul(h ^ h >>> 16, 2246822507);
        h = Math.imul(h ^ h >>> 13, 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
}

export function mulberry32(a: number) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

export function getPuzzleWithRng(
  rng: () => number, 
  difficulty: Difficulty = 'normal',
  consensusData: Record<string, { finds: number, appearances: number, rate: number }> = {}
): Puzzle {
  let rootLetters: string[] = [];
  let rootWordObj: string = "";
  let validWords: string[] = [];
  let bonusWords: string[] = [];

  const pool = ROOT_WORDS[difficulty];
  const cap = GRID_CAP[difficulty];
  // Require at least enough filtered words to fill the grid
  const minRequired = Math.min(cap, 5);
  
  while (validWords.length < minRequired) {
    const rootWord = pool[Math.floor(rng() * pool.length)];
    rootWordObj = rootWord;
    rootLetters = rootWord.split('');

    const getAnagrams = (list: string[]) => Array.from(new Set(
      list.filter(w => isValidAnagram(w, rootLetters)).map(w => w.toUpperCase())
    ));

    const tier1Words = getAnagrams(tier1 as string[]);
    const tier2Words = getAnagrams(tier2 as string[]);
    const tier3Words = getAnagrams(tier3 as string[]);
    const allBonusAnagrams = getAnagrams(tier4 as string[]);

    validWords = [];
    bonusWords = [];
    
    const bingoWord = rootWordObj.toUpperCase();

    // Reusable function to filter out words with consensus < 20%
    const processTier = (words: string[]) => {
      const scored = words.map(word => {
        const stats = consensusData[word];
        const hasConsensus = stats && stats.appearances >= 50;
        return {
          word,
          rate: hasConsensus ? stats.rate : -1,
          appearances: stats?.appearances || 0
        };
      });

      // Sort by rate descending (preserving Google/EF implicit ordering for -1)
      const sorted = [...scored].sort((a, b) => {
        if (a.rate >= 0 && b.rate >= 0) return b.rate - a.rate;
        if (a.rate >= 0) return -1;
        if (b.rate >= 0) return 1;
        return 0;
      });

      const box: string[] = [];
      const demoted: string[] = [];

      for (const item of sorted) {
        if (item.word === bingoWord) {
           box.push(item.word);
        } else if (item.rate >= 0 && item.rate < 0.20) {
           demoted.push(item.word);
        } else {
           box.push(item.word);
        }
      }
      return { box, demoted };
    };

    const t1 = processTier(tier1Words);
    const t2 = processTier(tier2Words);
    const t3 = processTier(tier3Words);

    // Build the grid respecting tier hierarchy
    const boxPool: string[] = [bingoWord];
    const addDistinct = (words: string[]) => {
      for (const w of words) {
        if (!boxPool.includes(w)) boxPool.push(w);
      }
    };

    addDistinct(t1.box);
    addDistinct(t2.box);
    
    if (difficulty === 'hard') {
      addDistinct(t3.box);
    }

    const nonBingoBox = boxPool.filter(w => w !== bingoWord);

    // Fill the board up to the cap
    const cappedGrid = [bingoWord, ...nonBingoBox.slice(0, cap - 1)];
    const overflowMain = nonBingoBox.slice(cap - 1);
    
    // Everything else falls into Bonus
    const demotedBonus = [...t1.demoted, ...t2.demoted];
    if (difficulty !== 'hard') demotedBonus.push(...t3.box, ...t3.demoted);
    else demotedBonus.push(...t3.demoted);

    const allBonus = Array.from(new Set([...overflowMain, ...demotedBonus, ...allBonusAnagrams]));

    validWords = cappedGrid;
    bonusWords = allBonus.filter(w => !validWords.includes(w));
  }

  // Scramble the source letters
  let scrambled = [...rootLetters];
  for (let i = scrambled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
  }

  return {
    sourceLetters: scrambled.map(c => c.toUpperCase()),
    validWords,
    bonusWords,
    bingoWord: rootWordObj.toUpperCase()
  };
}

export function getRandomPuzzle(difficulty: Difficulty = 'normal', consensusData?: any): Puzzle {
  return getPuzzleWithRng(Math.random, difficulty, consensusData);
}

export function getDailyPuzzle(dateStr: string, consensusData?: any): Puzzle {
  const seed = xmur3(dateStr)();
  // Daily Trial always uses Normal profile for competitive fairness
  return getPuzzleWithRng(mulberry32(seed), 'normal', consensusData);
}
