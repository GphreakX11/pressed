const fs = require('fs');
const html = fs.readFileSync('ef.html', 'utf8');

// EF usually stores these in <p> tags with <br> or simply in a list of words. Let's find matches.
// We can look for ">word<" or "word<br". Let's use a regex to find lowercase words between > and <.
const matches = [...html.matchAll(/>([a-z]+)</gi)];
let words = matches.map(m => m[1].toLowerCase());

// Filter and count
words = Array.from(new Set(words)).filter(w => w.length >= 3 && w.length <= 6);
console.log(`Found ${words.length} valid 3-6 letter words via >word<`);

// If that doesn't work, maybe they are separated by <br> or <br/>
const brMatches = [...html.matchAll(/([a-z]+)(?:<br\s*\/?>|\n)/gi)];
let brWords = brMatches.map(m => m[1].toLowerCase());
brWords = Array.from(new Set(brWords)).filter(w => w.length >= 3 && w.length <= 6);
console.log(`Found ${brWords.length} valid 3-6 letter words via string<br>`);

// Write the best one to a json file temporarily
if (brWords.length > 1000) {
   fs.writeFileSync('ef-words.json', JSON.stringify(brWords, null, 2));
} else if (words.length > 1000) {
   fs.writeFileSync('ef-words.json', JSON.stringify(words, null, 2));
}

// Let's also look for a Javascript array if it's embedded
const jsonMatches = html.match(/\["a","abandon","ability"/i);
if (jsonMatches) {
   console.log("Found JSON array!");
}
