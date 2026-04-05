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

// Words that should never appear on any game board.
// Carefully curated: blocks words that are PRIMARILY proper nouns, tech jargon,
// or obscure/archaic. Keeps dual-use words with strong common meanings
// (e.g. GRACE, LANCE, RUBY, BOOT, CHIP, CLAY, CODE, DEAN, DUKE, EARL, etc.)
const BLOCKED_WORDS = new Set([
  // ── 3-LETTER: Names-only (no strong common word meaning) ──
  'TOM','MON','BEN','BOB','CAM','DAN','DOM','DON','GUY','JAY','KEN',
  'NAN','ROB','ROD','SAL','LOU','LEN','JOE','TED','ANN','SUE','LEE',
  'IAN','MAC','GIL','HAL','JAN','JIM','JON','MEL','NED','PAM','PEG',
  'SID','TIM','VIC','ABE','ADA','AMY','BEA','DEE','ELI','FAY','IDA',
  'KAT','KAY','MAE','MEG','MIA','ORA','VIV','ZOE',
  // ── 3-LETTER: Tech-only / abbreviations ──
  'VAR','DEL','SRI','ALT','AMP','COM','ERR','APP','SQL','PHP','API',
  'CSS','XML','FTP','SSH','DNS','CPU','GPU','USB','VPN','PDF','GIF',
  'PNG','JPG','DOS','LAN','FAQ','RSS','ISP','HTM','GNU','ISM',
  'RAM','ROM','NAM','REG','ENG','GEN','TEL','SEC','LAS','LAT','MOD',
  // ── 3-LETTER: Archaic / obscure ──
  'THY','ASP','HOB','HOD','NIB','NUB','OAF','PAP','SOT','SOP','FOB',
  'FOP','DUN','IRK','AWL','COX',
  // ── 4-LETTER: Names-only ──
  'ALAN','ALEX','BRAD','CARL','CHAD','COLE','CURT','DAVE','DREW','ERIC',
  'EVAN','FINN','FRED','GARY','GENE','GLEN','GREG','HANS','HANK','HUGO',
  'IVAN','JACK','JAKE','JANE','JEAN','JEFF','JILL','JOAN','JOEL','JOHN',
  'JOSH','JUAN','JUDY','KANE','KARL','KATE','KENT','KIRK','KURT','KYLE',
  'LARS','LENA','LEON','LILY','LISA','LOIS','LORI','LUCA','LUCY','LUKE',
  'LYNN','MARC','MARK','MARY','MATT','MIKE','MILO','MONA','NEAL','NEIL',
  'NICK','NINA','NOAH','NOEL','NORA','OLGA','OTTO','OWEN','PAUL','PETE',
  'PHIL','RENE','RICK','RITA','ROLF','ROSA','ROSS','RUDY','RUSS','RUTH',
  'RYAN','SARA','SEAN','SETH','STAN','TARA','THEO','TODD','TONY','TROY',
  'VERA','WADE','WALT',
  // ── 4-LETTER: Tech-only (no common word meaning) ──
  'AJAX','ALGO','APPS','BASH','BLOB','BLOG','BYTE','CTRL','EXEC','FUNC',
  'GREP','HREF','HTML','HTTP','INIT','JAVA','JPEG','JSON','LIBS','LINT',
  'MIDI','NANO','NODE','NULL','PERL','PING','PROC','REPO','SMTP','SPEC',
  'SUDO','SYNC','UNIX','WGET','WIKI','YARN',
  // ── 4-LETTER: Archaic / obscure ──
  'CIAO','THEE','THOU','HATH','DOTH','UNTO',
  // ── 5-LETTER: Names-only ──
  'AARON','ALLEN','BARRY','BLAKE','BOBBY','BORIS','BRADY','BRETT','BRIAN',
  'BRUCE','CASEY','CLARK','CRAIG','DANNY','DAVIS','DEREK','DIANA','DONNA',
  'EDGAR','ELLEN','EMILY','FELIX','FLOYD','FRANK','GARRY','GLENN',
  'HARRY','HAZEL','HEIDI','HELEN','HENRY','HOMER','IRENE','JACOB','JAMES',
  'JANET','JASON','JENNY','JERRY','JIMMY','JOYCE','JULES','KAREN','KEITH',
  'KELLY','KENNY','KERRY','KEVIN','LANCE','LARRY','LAURA','LEWIS','LINDA',
  'LLOYD','LOGAN','MARIA','MASON','NANCY','NIGEL','NORMA','OSCAR','PEARL',
  'PERRY','PETER','POLLY','QUINN','RALPH','REESE','ROGER','ROCKY','SALLY',
  'SARAH','SIMON','SUSAN','TANYA','TERRY','TRENT','TYLER','VICKY','WAYNE',
  'WANDA','WENDY','WILMA',
  // ── 5-LETTER: Tech-only ──
  'ADMIN','ADDON','ARRAY','ASCII','CACHE','CLICK','CODEC','DEBUG','EMAIL',
  'FETCH','FLOAT','LINUX','MACRO','MERGE','MODEM','MYSQL','OMEGA','PARSE',
  'PIXEL','POPUP','PROXY','QUERY','QUEUE','REGEX','ROUTE','SCOPE','SETUP',
  'SLASH','STACK','SWIFT','TOKEN','ULTRA','VIRUS',
  // ── 5-LETTER: Obscure ──
  'AMINO','ASSAY','PROTO',
  // ── 6-LETTER: Names-only ──
  'AMAZON','CARTER','MURPHY','MURRAY','PALMER','PARKER','TRAVIS','MORGAN',
  'JORDAN','TAYLOR','AUSTIN','DENVER','HUDSON','HUNTER','SUMMER','ARCHER',
  'BROOKS','SKYLER','TUCKER','WALKER','CALVIN',
  // ── 6-LETTER: Tech-only ──
  'ANALOG','APACHE','APPEND','BACKUP','BITMAP','BUFFER','BUNDLE','BUTTON',
  'CACHED','CHROME','CLICKS','CODING','COLUMN','CONFIG','COOKIE','CURSOR',
  'CUSTOM','DAEMON','DEBIAN','DEVICE','DIALOG','DIGEST','DIGITS','DOCKER',
  'DOMAIN','DRIVER','ENABLE','ENCODE','ENGINE','EVOLVE','EXPORT','FLOPPY',
  'FORMAT','FORUMS','FRAMES','GITHUB','GLOBAL','GOOGLE','GRATIS','GRAPHS',
  'HANDLE','HEADER','HELPER','HIDDEN','HYBRID','IMPORT','INSERT','KERNEL',
  'LAYOUT','LENGTH','LINEAR','LINKED','LOCALE','LOOKUP','MARKUP','MATRIX',
  'METHOD','MOBILE','MODULE','OBJECT','OFFSET','ONLINE','OPTION','OUTPUT',
  'PASSWD','PLAYER','PLUGIN','PORTAL','PREFIX','RANDOM','README','REBOOT',
  'REDUCE','RENDER','RESEND','ROUTER','SCHEMA','SCRIPT','SCROLL','SENSOR',
  'SERVER','SIGNAL','SIGNED','SLIDER','SOCKET','SOURCE','STATIC','STATUS',
  'STORED','STREAM','STRING','STRIPE','SUBMIT','SUITES','SWITCH','SYMBOL',
  'SYNTAX','SYSTEM','TABLET','TARGET','THREAD','TOGGLE','TUNING','TYPING',
  'UPLOAD','VENDOR','VERIFY','WIDGET','WINDOW','WIZARD','BUREAU','REALTY',
]);

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

  // Block words that shouldn't appear in the game
  if (BLOCKED_WORDS.has(word.toUpperCase())) return false;
  
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
