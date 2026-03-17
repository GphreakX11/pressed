import easyNormalWords from './easy_normal_words.json';
import hardWords from './hard_words.json';

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

// 6-letter roots for easy/normal
const ROOT_WORDS_EASY_NORMAL = (easyNormalWords as string[]).filter(w => w.length === 6);
// 6-letter roots for hard
const ROOT_WORDS_HARD = (hardWords as string[]).filter(w => w.length === 6);

// Per-difficulty root pools
const ROOT_WORDS: Record<Difficulty, string[]> = {
  // Easy: 3+ vowels → lots of recognizable permutations
  easy:   ROOT_WORDS_EASY_NORMAL.filter(w => countVowels(w) >= 3),
  // Normal: 2-3 vowels → standard mix
  normal: ROOT_WORDS_EASY_NORMAL.filter(w => { const v = countVowels(w); return v >= 2 && v <= 3; }),
  // Hard: ≤2 vowels OR contains a power letter
  hard:   ROOT_WORDS_HARD.filter(w => countVowels(w) <= 2 || hasPowerLetter(w)),
};

// Grid caps per difficulty
const GRID_CAP: Record<Difficulty, number> = {
  easy:   8,
  normal: 12,
  hard:   15,
};

/**
 * Helper function to check if a dictionary word can be formed 
 * strictly using the available source letters (accounting for duplicates).
 */
function isValidAnagram(word: string, sourceLetters: string[]): boolean {
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
function xmur3(str: string) {
    for(var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) {
        h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
        h = h << 13 | h >>> 19;
    } return function() {
        h = Math.imul(h ^ h >>> 16, 2246822507);
        h = Math.imul(h ^ h >>> 13, 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
}

function mulberry32(a: number) {
    return function() {
      var t = a += 0x6D2B79F5;
      t = Math.imul(t ^ t >>> 15, t | 1);
      t ^= t + Math.imul(t ^ t >>> 7, t | 61);
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    }
}

function getPuzzleWithRng(rng: () => number, difficulty: Difficulty = 'normal'): Puzzle {
  let rootLetters: string[] = [];
  let rootWordObj: string = "";
  let validWords: string[] = [];
  let bonusWords: string[] = [];

  const pool = ROOT_WORDS[difficulty];
  const cap = GRID_CAP[difficulty];
  // Require at least enough filtered words to fill the grid
  const minRequired = Math.min(cap, 5);
  
  // Choose the correct target dictionary for validation
  const targetDictionary = difficulty === 'hard' ? hardWords : easyNormalWords;

  while (validWords.length < minRequired) {
    const rootWord = pool[Math.floor(rng() * pool.length)];
    rootWordObj = rootWord;
    rootLetters = rootWord.split('');

    // Filter the target curated list (10k or 20k) for valid anagrams
    // Both dictionaries are already sanitized heavily
    const validAnagrams = (targetDictionary as string[])
      .filter((word: string) => isValidAnagram(word, rootLetters))
      .map(w => w.toUpperCase());

    const deduplicated = Array.from(new Set(validAnagrams));

    validWords = [];
    bonusWords = [];

    if (deduplicated.length > 0) {
      const bingoWord = rootWordObj.toUpperCase();
      const nonBingo = deduplicated.filter(w => w !== bingoWord);

      // Bingo word first, then fill grid up to the per-difficulty cap
      const cappedGrid = [bingoWord, ...nonBingo.slice(0, cap - 1)];
      const overflow = nonBingo.slice(cap - 1);

      validWords = cappedGrid;
      bonusWords.push(...overflow);
    }
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

export function getRandomPuzzle(difficulty: Difficulty = 'normal'): Puzzle {
  return getPuzzleWithRng(Math.random, difficulty);
}

export function getDailyPuzzle(dateStr: string): Puzzle {
  const seed = xmur3(dateStr)();
  // Daily Trial always uses Normal profile for competitive fairness
  return getPuzzleWithRng(mulberry32(seed), 'normal');
}
