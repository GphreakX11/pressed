#!/usr/bin/env node
/**
 * Generates synapsePairs.json — 2,000 word pairs that share exactly one unique letter.
 * 
 * Uses a curated blocklist to remove:
 *   - Tech jargon (code, hack, loop, cache, etc.)
 *   - Proper nouns / brand names (Amazon, Carter, Murphy, etc.)
 *   - Obscure / archaic words (thee, thy, hath, etc.)
 *   - Abbreviations / acronyms (var, del, sri, etc.)
 *   - Web/internet terms (blog, spam, wiki, etc.)
 * 
 * Usage: node scripts/generateSynapsePairs.js
 * Output: src/lib/synapsePairs.json
 */

const fs = require('fs');
const path = require('path');

// ── Comprehensive Blocklist ──
// Tech, programming, web, computing
const TECH_WORDS = new Set([
  'ADMIN','ADDON','AJAX','ALGO','ALPHA','ANALOG','APACHE','APPEND','APPS','ARRAY',
  'ASCII','AUDIO','BATCH','BETA','BITMAP','BLOG','BLOGS','BLOCKS','BOOT','BUFFER',
  'BYTE','BYTES','CACHE','CACHED','CHAR','CHAT','CHIP','CHIPS','CHROME','CLICK',
  'CLICKS','CLIP','CLIPS','CODEC','CODE','CODES','CODING','COLUMN','CONFIG','COOKIE',
  'CTRL','CURSOR','CUSTOM','DAEMON','DATA','DEBUG','DEBIAN','DELETE','DEMO','DEVICE',
  'DIALOG','DIGEST','DIGITS','DOCKER','DOCS','DOMAIN','DONATE','DRIVER','EDIT','EDITED',
  'EMAIL','ENCODE','ENGINE','ERROR','EXPORT','FETCH','FILE','FILES','FILTER','FLASH',
  'FLOAT','FONT','FONTS','FORMAT','FORUMS','FRAME','FRAMES','FUNC','GITHUB','GLOBAL',
  'GOOGLE','GRATIS','GRAPH','GRAPHS','GRID','HACK','HACKS','HANDLE','HEADER','HELPER',
  'HIDDEN','HOST','HREF','HTML','HTTP','HTTPS','HYBRID','ICON','ICONS','IMPORT',
  'INDEX','INFO','INPUT','INPUTS','INSERT','INTEL','JAVA','JPEG','JSON','KERNEL',
  'LABEL','LABS','LANG','LAYER','LAYOUT','LENGTH','LIBS','LINEAR','LINK','LINKS',
  'LINKED','LINUX','LOCALE','LOGIN','LOGO','LOGOS','LOOKUP','LOOP','LOOPS','MACRO',
  'MARKUP','MATCH','MATRIX','MEDIA','MEGA','MERGE','METHOD','MICRO','MIDI','MOBILE',
  'MODE','MODEM','MODULE','MOUSE','MYSQL','NANO','NEON','NODE','NODES','NULL',
  'OBJECT','OFFSET','OMEGA','ONLINE','OOPS','OPTION','OUTPUT','OVER','PAGE','PAGES',
  'PANEL','PARSE','PASSWD','PATCH','PATH','PAUSE','PERL','PING','PIXEL','PIXELS',
  'PLAYER','PLUG','PLUGIN','POPUP','PORTAL','POST','PREFIX','PRINT','PROXY','QUAD',
  'QUERY','QUEUE','RACK','RAM','RANDOM','README','REBOOT','RECORD','REDUCE','REGEX',
  'RENDER','REPO','RESET','RESEND','ROUTER','ROUTE','RUBY','SAMPLE','SAVES','SCAN',
  'SCHEMA','SCOPE','SCRIPT','SCROLL','SEARCH','SELECT','SENSOR','SERVER','SETUP',
  'SHELL','SHIFT','SIGNAL','SIGNED','SITE','SITES','SKYPE','SLACK','SLIDER','SLOTS',
  'SMART','SMTP','SOCKET','SOURCE','SPAM','SPEC','SPECS','STACK','STATIC','STATUS',
  'STORED','STREAM','STRING','STRIP','STRIPE','STYLE','SUBMIT','SUDO','SWITCH','SWIFT',
  'SYMBOL','SYNC','SYNTAX','SYSTEM','TABLE','TABLET','TAGS','TARGET','TECH','TEXT',
  'THEME','THREAD','TOGGLE','TOKEN','TOOLS','TRACK','TRACKS','TYPE','TYPED','TYPING',
  'ULTRA','UNIX','UPLOAD','URLS','USER','USERS','VENDOR','VERIFY','VIDEO','VIRUS',
  'WATTS','WEB','WIDGET','WIKI','WINDOW','WIZARD','XBOX','XRAY','YARN','ZERO','ZOOM',
  'PIXEL','POPUP','ROUTER','BACKUP','BUNDLE','BUTTON','SCROLL','TABLET','TOGGLE',
  'UPLOAD','REALTY','BUREAU','SUITES','TUNER','FLOPPY','EVOLVE','LOCALE'
]);

// Proper nouns, names, places, brands
const PROPER_NOUNS = new Set([
  'AMAZON','AUGUST','BARRY','BORIS','BRADY','CARTER','CASEY','CRAIG','DEREK','DIANA',
  'ELLEN','FLOYD','GRANT','HARRY','JACOB','JERRY','JOYCE','KAREN','KEITH','KENNY',
  'LANCE','LOGAN','MARIA','MASON','MURRAY','MURPHY','NANCY','NICK','OSCAR','PALMER',
  'PARKER','PEARL','QUINN','REESE','ROCKY','SALLY','SIMON','TANYA','TERRY','TYLER',
  'VICKY','WENDY','EURO','EUROS','PETER','SARAH','ROBIN','HENRY','HELEN','GRACE',
  'FRANK','BRUCE','AARON','ALLEN','ANGEL','BLAKE','BRIAN','CAROL','CLARK','DANNY',
  'DAVIS','DONNA','EDGAR','ELMER','EMILY','FELIX','FLOYD','GARRY','GILES','GLENN',
  'IRENE','JANET','JASON','JENNY','JIMMY','JULES','KELLY','KEVIN','LARRY','LAURA',
  'LEWIS','LINDA','LLOYD','MABEL','NIGEL','NORMA','OLIVE','PETER','RALPH','ROGER',
  'SUSAN','TRENT','VICTOR','WAYNE','PERRY','BRETT','CLIVE','FRITZ','GRETA',
  'HEIDI','HOMER','MARGE','NELLY','POLLY','RUFUS','SONIA','WANDA','WILMA'
]);

// Archaic, obscure, abbreviations
const JUNK_WORDS = new Set([
  'THEE','THY','THOU','HATH','DOTH','UNTO','WHENCE','HENCE','THENCE','ALAS',
  'YORE','NIGH','WRIT','WIST','SMOTE','SLEW','ALMS','BESEECH','BETWIXT',
  'VAR','DEL','SRI','HREF','NULL','INIT','FUNC','ARGS','BOOL','ENUM','IMPL',
  'ITER','SEPT','DICT','ATTR','PARAM','PARA','REGEX','STDIN','PROTO',
  'CIAO','AIDE','AMINO','ALLOY','ADDON','ASSAY','AVID','BEVY','BAWDY',
  'ERR','EOF','ETC','WGET','GREP','SUDO','CHMOD','MKDIR','RMDIR',
  'PETITE','FLYER','COWBOY','CHICKS','SKINS','CACHED','KITTY','FRIDGE',
  'PICNIC','ANCHOR','GRAPHS','NAILS','WATTS','CLICKS','INPUTS'
]);

// Load word lists
const tier1 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'tier1_ef3k.json'), 'utf8'));
const tier2 = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'src', 'lib', 'tier2_google10k.json'), 'utf8'));

// Combine, filter to 4-6 letter words, uppercase, deduplicate, remove blocked words
const blocklist = new Set([...TECH_WORDS, ...PROPER_NOUNS, ...JUNK_WORDS]);

const allWords = [...new Set([...tier1, ...tier2])]
  .map(w => w.toUpperCase())
  .filter(w => {
    if (w.length < 4 || w.length > 6) return false;
    if (!/^[A-Z]+$/.test(w)) return false;
    if (blocklist.has(w)) return false;
    return true;
  });

console.log(`Word pool after filtering: ${allWords.length} words (4-6 letters, blocklist removed)`);

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

const TARGET = 2000;
const pairs = [];
const usedPairKeys = new Set();
const wordUsageCount = {};

// Shuffle helper
function shuffle(arr) {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

console.log('Generating pairs...');

// Strategy: shuffle words and try to spread usage evenly
const shuffledWords = shuffle([...allWords]);

// Sort candidates by usage count to prefer less-used words
function sortByUsage(candidates) {
  return [...candidates].sort((a, b) => (wordUsageCount[a] || 0) - (wordUsageCount[b] || 0));
}

// Multiple passes to reach target
for (let pass = 0; pass < 5 && pairs.length < TARGET; pass++) {
  const wordsThisPass = shuffle([...allWords]);
  
  for (const wordA of wordsThisPass) {
    if (pairs.length >= TARGET) break;

    const lettersA = uniqueLetters(wordA);

    // Try letters in the word to find a partner
    for (const targetLetter of lettersA) {
      if (pairs.length >= TARGET) break;

      const candidates = letterIndex[targetLetter];
      if (!candidates) continue;

      // Prefer less-used candidates for variety
      const sortedCandidates = sortByUsage(candidates);

      for (const wordB of sortedCandidates) {
        if (wordA === wordB) continue;

        // Check they share EXACTLY one unique letter
        const shared = sharedLetters(wordA, wordB);
        if (shared.length !== 1) continue;

        // Deduplicate (A-B same as B-A)
        const key = [wordA, wordB].sort().join('|');
        if (usedPairKeys.has(key)) continue;

        usedPairKeys.add(key);
        wordUsageCount[wordA] = (wordUsageCount[wordA] || 0) + 1;
        wordUsageCount[wordB] = (wordUsageCount[wordB] || 0) + 1;
        
        pairs.push({
          wordA,
          wordB,
          sharedLetter: shared[0]
        });
        break; // Move to next word
      }
    }
  }
}

// Final shuffle of the generated pairs
shuffle(pairs);

console.log(`Generated ${pairs.length} pairs.`);

if (pairs.length < TARGET) {
  console.warn(`WARNING: Only generated ${pairs.length}/${TARGET} pairs.`);
}

// Stats
const uniqueWordsUsed = new Set();
pairs.forEach(p => { uniqueWordsUsed.add(p.wordA); uniqueWordsUsed.add(p.wordB); });
console.log(`Unique words in final pairs: ${uniqueWordsUsed.size}`);

const usageCounts = Object.values(wordUsageCount);
const maxUsage = Math.max(...usageCounts);
const avgUsage = (usageCounts.reduce((a,b) => a+b, 0) / usageCounts.length).toFixed(1);
console.log(`Word usage — max: ${maxUsage}, avg: ${avgUsage}`);

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
