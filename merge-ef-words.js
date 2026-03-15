const fs = require('fs');
const path = require('path');

const efWordsPath = path.join(__dirname, 'ef-words.json');
const cleanWordsPath = path.join(__dirname, 'src', 'lib', 'clean-words.json');

const efWords = JSON.parse(fs.readFileSync(efWordsPath, 'utf8'));
const currentWords = JSON.parse(fs.readFileSync(cleanWordsPath, 'utf8'));

console.log(`Initial dictionary size: ${currentWords.length}`);

// Merge, Lowercase and Deduplicate
let merged = currentWords.concat(efWords);
merged = merged.map(w => w.toLowerCase());

// Filter out some obvious junk that might have slipped from the HTML scrape
const junk = ['null', 'div', 'span', 'href', 'http', 'https', 'com', 'www', 'html'];
merged = merged.filter(w => !junk.includes(w) && w.length >= 3 && w.length <= 6);

const deduplicated = Array.from(new Set(merged)).sort();

console.log(`Merged dictionary size: ${deduplicated.length} (+${deduplicated.length - currentWords.length})`);

fs.writeFileSync(cleanWordsPath, JSON.stringify(deduplicated, null, 2));
console.log('Successfully injected the Top 3000 EF words into clean-words.json!');
