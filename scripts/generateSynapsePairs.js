#!/usr/bin/env node
/**
 * Generates synapsePairs.json — 1,000 word pairs that share exactly one unique letter.
 * 
 * Usage: node scripts/generateSynapsePairs.js
 * Output: src/lib/synapsePairs.json
 */

const fs = require('fs');
const path = require('path');

// Load word lists
const tier1 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'tier1_ef3k.json'), 'utf8'));
const tier2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'tier2_google10k.json'), 'utf8'));

// Filter to 4-6 letter words, uppercase, deduplicate
const allWords = [...new Set([...tier1, ...tier2])]
  .map(w => w.toUpperCase())
  .filter(w => w.length >= 4 && w.length <= 6 && /^[A-Z]+$/.test(w));

console.log(`Word pool: ${allWords.length} words (4-6 letters from Tier 1 + Tier 2)`);

/**
 * Returns the set of unique letters in a word.
 */
function uniqueLetters(word) {
  return new Set(word.split(''));
}

/**
 * Finds the set of letters shared between two words.
 */
function sharedLetters(a, b) {
  const setA = uniqueLetters(a);
  const setB = uniqueLetters(b);
  const shared = [];
  for (const ch of setA) {
    if (setB.has(ch)) shared.push(ch);
  }
  return shared;
}

// Build an index: letter -> list of words containing that letter
const letterIndex = {};
for (const word of allWords) {
  for (const ch of uniqueLetters(word)) {
    if (!letterIndex[ch]) letterIndex[ch] = [];
    letterIndex[ch].push(word);
  }
}

const TARGET = 1000;
const pairs = [];
const usedPairKeys = new Set();

// Shuffle helper
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

console.log('Generating pairs...');

// Strategy: for each word, find a partner that shares exactly one unique letter
const shuffledWords = shuffle([...allWords]);

for (const wordA of shuffledWords) {
  if (pairs.length >= TARGET) break;

  const lettersA = uniqueLetters(wordA);

  // Try letters in the word to find a partner
  for (const targetLetter of lettersA) {
    if (pairs.length >= TARGET) break;

    const candidates = letterIndex[targetLetter];
    if (!candidates) continue;

    // Shuffle candidates for variety
    const shuffledCandidates = shuffle([...candidates]);

    for (const wordB of shuffledCandidates) {
      if (wordA === wordB) continue;

      // Check they share EXACTLY one unique letter
      const shared = sharedLetters(wordA, wordB);
      if (shared.length !== 1) continue;

      // Deduplicate (A-B same as B-A)
      const key = [wordA, wordB].sort().join('|');
      if (usedPairKeys.has(key)) continue;

      usedPairKeys.add(key);
      pairs.push({
        wordA,
        wordB,
        sharedLetter: shared[0]
      });
      break; // Move to next word
    }
  }
}

console.log(`Generated ${pairs.length} pairs.`);

if (pairs.length < TARGET) {
  console.warn(`WARNING: Only generated ${pairs.length}/${TARGET} pairs. Consider expanding word pool.`);
}

// Verify integrity
let valid = 0;
for (const p of pairs) {
  const shared = sharedLetters(p.wordA, p.wordB);
  if (shared.length === 1 && shared[0] === p.sharedLetter) {
    valid++;
  } else {
    console.error(`INVALID PAIR: ${p.wordA} / ${p.wordB} — shared: ${shared.join(',')}`);
  }
}
console.log(`Verification: ${valid}/${pairs.length} pairs valid.`);

// Write output
const outPath = path.join(__dirname, '..', 'src', 'lib', 'synapsePairs.json');
fs.writeFileSync(outPath, JSON.stringify(pairs, null, 2));
console.log(`Written to: ${outPath}`);
