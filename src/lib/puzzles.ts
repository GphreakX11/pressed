import commonWords from './clean-words.json';
import blocklist from './blocklist.json';
import sowpods from './sowpods-static.json';

export type Puzzle = {
  sourceLetters: string[];
  validWords: string[];
  bonusWords: string[];
  bingoWord: string;
};

// Compute all valid 6-letter root words from the common dictionary
const ROOT_WORDS = commonWords.filter((w: string) => w.length === 6);

/**
 * Helper function to check if a dictionary word can be formed 
 * strictly using the available source letters (accounting for duplicates).
 */
function isValidAnagram(word: string, sourceLetters: string[]): boolean {
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

function getPuzzleWithRng(rng: () => number): Puzzle {
  let rootLetters: string[] = [];
  let rootWordObj: string = "";
  let validWords: string[] = [];
  let bonusWords: string[] = [];

  // Randomly pick a 6-letter root word and evaluate it.
  // We randomly select from ROOT_WORDS until we find one that generates >= 10 REQUIRED words.
  while (validWords.length < 10) {
    const rootWord = ROOT_WORDS[Math.floor(rng() * ROOT_WORDS.length)];
    rootWordObj = rootWord;
    rootLetters = rootWord.split('');
    
    // Filter against the common words dictionary instead of the massive Scrabble dictionary.
    const allValidFound = commonWords.filter((word: string) => {
      return isValidAnagram(word, rootLetters);
    }).map((w: string) => w.toUpperCase());
    
    // De-duplicate in case of any overlaps
    const deduplicated = Array.from(new Set(allValidFound));
    
    // Sift out the generic blocklist words into a bonus array
    validWords = [];
    bonusWords = [];
    const blockListUpper = blocklist.map(w => w.toUpperCase());
    
    for (const w of deduplicated) {
      if (blockListUpper.includes(w)) {
        bonusWords.push(w);
      } else {
        validWords.push(w);
      }
    }
    
    // Hard cap the main grid to 14 words to prevent mobile scroll overflow
    if (validWords.length > 0) {
      const bingoWord = rootWordObj.toUpperCase();
      const nonBingoWords = validWords.filter(w => w !== bingoWord);
      
      // Select bingo word first, then top 13 most common
      const cappedGrid = [bingoWord, ...nonBingoWords.slice(0, 13)];
      const overflowBonus = nonBingoWords.slice(13);
      
      validWords = cappedGrid;
      bonusWords.push(...overflowBonus);
    }
  }

  // EXHAUSTIVE SOWPODS FALLBACK
  // Any legally playable word in the entire english scrabble dictionary 
  // that was NOT already caught by our curated 10k list above gets
  // indiscriminately added to the Bonus Words pool.
  const allSowpodsValid = sowpods.filter((word: string) => {
    return isValidAnagram(word, rootLetters);
  }).map((w: string) => w.toUpperCase());
  
  for (const sowWord of allSowpodsValid) {
    if (!validWords.includes(sowWord) && !bonusWords.includes(sowWord)) {
       bonusWords.push(sowWord);
    }
  }

  // Create a scrambled copy of the root letters for the user to solve
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

export function getRandomPuzzle(): Puzzle {
  return getPuzzleWithRng(Math.random);
}

export function getDailyPuzzle(dateStr: string): Puzzle {
  const seed = xmur3(dateStr)();
  return getPuzzleWithRng(mulberry32(seed));
}
