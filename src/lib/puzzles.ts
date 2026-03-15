import dictionaryWords from 'an-array-of-english-words';

export type Puzzle = {
  sourceLetters: string[];
  validWords: string[];
};

// We keep a curated list of reliable 6-letter source arrays
const SOURCE_PUZZLES: string[][] = [
  ["N", "R", "U", "I", "F", "A"], // UNFAIR
  ["T", "S", "E", "A", "M", "R"], // MASTER
  ["P", "L", "A", "N", "E", "T"], // PLANET
  ["P", "R", "I", "N", "G", "S"], // SPRING
  ["K", "E", "R", "A", "B", "S"]  // BAKERS
];

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
  // Pick a random set of 6 source letters
  const sourceLetters = SOURCE_PUZZLES[Math.floor(Math.random() * SOURCE_PUZZLES.length)];
  
  // Mathematically derive *all* true valid English words from the dictionary
  const validWords = dictionaryWords.filter(word => {
    return isValidAnagram(word, sourceLetters);
  }).map(w => w.toUpperCase()); // Ensure they are returned uppercase for the UI

  // Since `an-array-of-english-words` is very exhaustive, sometimes it includes incredibly obscure 3-letter words. 
  // But this strictly guarantees no hallucinations ("INFRU" evaluates to false) and includes every possible permutation.

  return {
    sourceLetters,
    validWords
  };
}
