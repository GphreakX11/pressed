const fs = require('fs');

fetch('https://raw.githubusercontent.com/first20hours/google-10000-english/master/google-10000-english-no-swears.txt')
  .then(res => res.text())
  .then(text => {
    const rawWords = text.split(/\r?\n/);
    const validWords = rawWords.map(w => w.trim()).filter(w => w.length >= 3 && w.length <= 6);
    fs.writeFileSync('src/lib/commonWords.json', JSON.stringify(validWords));
    console.log(`Saved ${validWords.length} valid words to commonWords.json!`);
  })
  .catch(err => console.error(err));
