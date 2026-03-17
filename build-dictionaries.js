const fs = require('fs');
const path = require('path');

const ENABLE1_URL = 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt';
const ENGLISH_10K_URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt';
const ENGLISH_20K_URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/20k.txt';

const TECH_STRINGS = ['http', 'html', 'www', 'com', 'org', 'net', 'href'];

async function fetchWordList(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  const text = await response.text();
  return text.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);
}

function hasTechString(word) {
  const lower = word.toLowerCase();
  for (const tech of TECH_STRINGS) {
    if (lower.includes(tech)) {
      return true;
    }
  }
  return false;
}

async function buildDictionaries() {
  console.log('Fetching word lists...');
  const [enable1, english10k, english20k] = await Promise.all([
    fetchWordList(ENABLE1_URL),
    fetchWordList(ENGLISH_10K_URL),
    fetchWordList(ENGLISH_20K_URL)
  ]);

  console.log(`Loaded ${enable1.length} words from ENABLE1`);
  console.log(`Loaded ${english10k.length} words from 10k list`);
  console.log(`Loaded ${english20k.length} words from 20k list`);

  // Create a fast lookup set for ENABLE1 (case-insensitive)
  const enable1Set = new Set(enable1.map(w => w.toLowerCase()));

  // Sanitization Function
  function sanitizeList(list, listName) {
    console.log(`\nSanitizing ${listName}...`);
    let initialCount = list.length;
    
    // 1. Length 3-6
    let filtered = list.filter(w => w.length >= 3 && w.length <= 6);
    console.log(` - Filtered out ${initialCount - filtered.length} words outside 3-6 letters limit`);
    initialCount = filtered.length;

    // 2. Web-Purge
    filtered = filtered.filter(w => !hasTechString(w));
    console.log(` - Purged ${initialCount - filtered.length} tech-related words`);
    initialCount = filtered.length;

    // 3. Strict ENABLE1 Verification
    filtered = filtered.filter(w => enable1Set.has(w.toLowerCase()));
    console.log(` - Discarded ${initialCount - filtered.length} non-dictionary words`);

    // Normalize to UpperCase and Deduplicate
    const finalWords = Array.from(new Set(filtered.map(w => w.toUpperCase())));
    
    console.log(`Final ${listName} size: ${finalWords.length} words`);
    return finalWords;
  }

  const easyNormalWords = sanitizeList(english10k, '10k List (Easy/Normal)');
  const hardWords = sanitizeList(english20k, '20k List (Hard)');

  // Filter and save ENABLE1 as the fallback full dictionary
  const enable1List = enable1.filter(w => w.length >= 3 && w.length <= 6).map(w => w.toUpperCase());
  const enable1Filtered = Array.from(new Set(enable1List));
  enable1Filtered.sort();

  // Output paths
  const easyNormalPath = path.join(__dirname, 'src', 'lib', 'easy_normal_words.json');
  const hardWordsPath = path.join(__dirname, 'src', 'lib', 'hard_words.json');
  const enable1Path = path.join(__dirname, 'src', 'lib', 'enable1_3to6.json');

  fs.writeFileSync(easyNormalPath, JSON.stringify(easyNormalWords, null, 2));
  fs.writeFileSync(hardWordsPath, JSON.stringify(hardWords, null, 2));
  fs.writeFileSync(enable1Path, JSON.stringify(enable1Filtered));

  console.log(`\nSuccess!`);
  console.log(` - Saved ${easyNormalPath}`);
  console.log(` - Saved ${hardWordsPath}`);
  console.log(` - Saved ${enable1Path} (${enable1Filtered.length} words)`);
}

buildDictionaries().catch(console.error);
