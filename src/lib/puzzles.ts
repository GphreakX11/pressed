import sowpods from './sowpods-static.json';
import wl from 'wordlist-english';

export type Puzzle = {
  sourceLetters: string[];
  validWords: string[];
  bonusWords: string[];
  bingoWord: string;
};

// 1. Commonality & Root Generation Guard
// We generate puzzles EXCLUSIVELY from the top 10% most common English words
// to ensure the 6-letter root word is instantly recognizable by all players.
const ROOT_WORDS = wl['english/10'].filter((w: string) => {
  return w.length === 6 && sowpods.includes(w.toUpperCase());
});

// 2. Case-Sensitivity Filter
// As per the requirement, we exclude any word that only exists capitalized in the 
// English corpus data (e.g. 'Albert' or 'China' without 'china'). 
// `wordlist-english.english` inherently checks this by strictly exposing safe lowercase variants.
function meetsCaseSensitivityFilter(word: string): boolean {
  return wl.english.includes(word.toLowerCase());
}

/**
 * Helper function to check if a dictionary word can be formed 
 * strictly using the available source letters (accounting for duplicates).
 */
function isValidAnagram(word: string, sourceLetters: string[]): boolean {
  // 3. Length Guard: Ensure words are at least 3 letters long.
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
  while (validWords.length < 10) {
    const rootWord = ROOT_WORDS[Math.floor(rng() * ROOT_WORDS.length)];
    rootWordObj = rootWord;
    rootLetters = rootWord.split('');
    
    // 4. Scrabble/Enable1 Standard Base
    // All anagrams must be mathematically valid and exist in the SOWPODS dictionary.
    const allSowpodsValid = sowpods.filter((word: string) => {
      return isValidAnagram(word, rootLetters);
    });

    // 5. Commonality Filter
    // Discard words with a frequency score below our threshold (`wordlist-english.english`) 
    // to avoid 'Scrabble-obscure' words that nobody knows. Applies case-sensitivity filter.
    const filteredForCommonality = allSowpodsValid.filter((w: string) => {
      return meetsCaseSensitivityFilter(w);
    }).map((w: string) => w.toUpperCase());
    
    const deduplicated = Array.from(new Set(filteredForCommonality));
    
    validWords = [];
    bonusWords = [];
    
    // Hard cap the main grid to 14 words to prevent mobile scroll overflow
    if (deduplicated.length > 0) {
      const bingoWord = rootWordObj.toUpperCase();
      const nonBingoWords = deduplicated.filter(w => w !== bingoWord);
      
      // Select bingo word first, then up to 13 others for the main grid
      const cappedGrid = [bingoWord, ...nonBingoWords.slice(0, 13)];
      const overflowBonus = nonBingoWords.slice(13);
      
      validWords = cappedGrid;
      bonusWords.push(...overflowBonus);
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
