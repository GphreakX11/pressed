import commonWords from './clean-words.json';
import blocklist from './blocklist.json';

export type Puzzle = {
  sourceLetters: string[];
  validWords: string[];
  bonusWords: string[];
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

export function getRandomPuzzle(): Puzzle {
  let rootLetters: string[] = [];
  let validWords: string[] = [];
  let bonusWords: string[] = [];

  // Randomly pick a 6-letter root word and evaluate it.
  // We randomly select from ROOT_WORDS until we find one that generates >= 10 REQUIRED words.
  while (validWords.length < 10) {
    const rootWord = ROOT_WORDS[Math.floor(Math.random() * ROOT_WORDS.length)];
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
  }

  // Create a scrambled copy of the root letters for the user to solve
  let scrambled = [...rootLetters];
  for (let i = scrambled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [scrambled[i], scrambled[j]] = [scrambled[j], scrambled[i]];
  }

  return {
    sourceLetters: scrambled.map(c => c.toUpperCase()),
    validWords,
    bonusWords
  };
}
