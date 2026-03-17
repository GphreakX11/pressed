const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const ENABLE1_URL = 'https://raw.githubusercontent.com/dolph/dictionary/master/enable1.txt';
const ENGLISH_10K_URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt';
const ENGLISH_20K_URL = 'https://raw.githubusercontent.com/first20hours/google-10000-english/master/20k.txt';
const EF_URL = 'https://www.ef.edu/english-resources/english-vocabulary/top-3000-words/';

const TECH_STRINGS = ['http', 'html', 'www', 'com', 'org', 'net', 'href'];

async function fetchWordList(url) {
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to fetch ${url}: ${response.statusText}`);
  }
  const text = await response.text();
  return text.split(/\r?\n/).map(w => w.trim()).filter(w => w.length > 0);
}

async function fetchEFTop3000() {
  console.log('Scraping EF Top 3000...');
  const response = await fetch(EF_URL);
  if (!response.ok) {
      throw new Error(`Failed to fetch EF list: ${response.statusText}`);
  }
  const html = await response.text();
  const dom = new JSDOM(html);
  
  const content = dom.window.document.querySelector('.field-item.even') || dom.window.document.body;
  if (!content) {
      throw new Error("Could not find content container on EF site.");
  }
  
  // Replace all <br> with spaces to prevent words from mushing together in textContent
  content.querySelectorAll('br').forEach(br => br.replaceWith(' '));
  content.querySelectorAll('p').forEach(p => { p.innerHTML = p.innerHTML + ' '; });
  
  const text = content.textContent || "";
  const rawWords = text.split(/[\s,]+/);
  
  const potentialWords = rawWords.map(w => w.replace(/[^a-zA-Z]/g, '').toLowerCase()).filter(w => w.length >= 3 && w.length <= 6);
  const deduplicated = Array.from(new Set(potentialWords));
  console.log(`Scraped ${deduplicated.length} potential words from EF`);
  return deduplicated;
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
  const [enable1, english10k, english20k, ef3000] = await Promise.all([
    fetchWordList(ENABLE1_URL),
    fetchWordList(ENGLISH_10K_URL),
    fetchWordList(ENGLISH_20K_URL),
    fetchEFTop3000()
  ]);

  console.log(`Loaded ${enable1.length} words from ENABLE1`);
  console.log(`Loaded ${english10k.length} words from 10k list`);
  console.log(`Loaded ${english20k.length} words from 20k list`);

  // Create a fast lookup set for ENABLE1 (case-insensitive)
  // And also track if it might be a proper noun if only capitalized in enable1? 
  // Actually, enable1 is mostly lowercase. We will just check inclusion.
  const enable1Set = new Set(enable1.map(w => w.toLowerCase()));

  // Simplistic proper noun heuristic: we will rely on enable1. 
  // If it's not in enable1, it gets tossed anyway.
  
  // Sanitization Function
  function sanitizeList(list, listName) {
    console.log(`\nSanitizing ${listName}...`);
    let initialCount = list.length;
    
    // 1. Length 3-6
    let filtered = list.filter(w => w.length >= 3 && w.length <= 6);
    console.log(` - Filtered out ${initialCount - filtered.length} words outside 3-6 letters limit`);
    initialCount = filtered.length;

    // 2. Web-Purge & Common Proper nouns
    // Just relying on hasTechString for now
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

  const tier1 = sanitizeList(ef3000, 'Tier 1 (EF Top 3000)');
  const tier2 = sanitizeList(english10k, 'Tier 2 (Google 10k)');
  const tier3 = sanitizeList(english20k, 'Tier 3 (Google 20k)');

  // Filter and save ENABLE1 as Tier 4 (fallback full dictionary)
  const enable1List = enable1.filter(w => w.length >= 3 && w.length <= 6).map(w => w.toUpperCase());
  const tier4 = Array.from(new Set(enable1List));
  tier4.sort(); // Sorting Tier 4 as it's just for validation

  // Output paths
  const tier1Path = path.join(__dirname, 'src', 'lib', 'tier1_ef3k.json');
  const tier2Path = path.join(__dirname, 'src', 'lib', 'tier2_google10k.json');
  const tier3Path = path.join(__dirname, 'src', 'lib', 'tier3_google20k.json');
  const tier4Path = path.join(__dirname, 'src', 'lib', 'tier4_enable1.json');

  fs.writeFileSync(tier1Path, JSON.stringify(tier1, null, 2));
  fs.writeFileSync(tier2Path, JSON.stringify(tier2, null, 2));
  fs.writeFileSync(tier3Path, JSON.stringify(tier3, null, 2));
  fs.writeFileSync(tier4Path, JSON.stringify(tier4));

  console.log(`\nSuccess!`);
  console.log(` - Saved ${tier1Path}`);
  console.log(` - Saved ${tier2Path}`);
  console.log(` - Saved ${tier3Path}`);
  console.log(` - Saved ${tier4Path} (${tier4.length} words)`);
}

buildDictionaries().catch(console.error);
