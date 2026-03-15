const fs = require('fs');
const path = require('path');

const missingWords = [
  'nod', 'doze', 'taco', 'wifi', 'app', 'blog', 'nerd', 'bro', 'bot', 'tech', 'sync',
  'mac', 'pac', 'zip', 'gif', 'sec', 'dev', 'sys', 'dir', 'bin', 'var', 'cfg', 'log', 'api', 'url', 'uri',
  'ssh', 'ssl', 'tls', 'tcp', 'udp', 'dns', 'ftp', 'sql', 'css', 'html', 'xml', 'json', 'csv', 'yaml', 'toml',
  'npm', 'npx', 'yarn', 'git', 'svn', 'hg', 'cvs', 'tar', 'gz', 'bz2', 'xz', 'rar', 'exe', 'dll', 'so',
  'pore', 'pores', 'soze', 'awol'
];

const inputFilePath = path.join(__dirname, 'src', 'lib', 'clean-words.json');

try {
  const rawData = fs.readFileSync(inputFilePath, 'utf8');
  let commonWords = JSON.parse(rawData);
  
  console.log(`Loaded ${commonWords.length} words.`);
  
  // Normalize and add
  const missingUpper = missingWords.map(w => w.toUpperCase());
  const currentUpper = commonWords.map(w => w.toUpperCase());
  
  for (const w of missingUpper) {
    if (!currentUpper.includes(w) && w.length >= 3 && w.length <= 6) {
      commonWords.push(w.toLowerCase());
      console.log(`Added: ${w}`);
    }
  }

  // Deduplicate and sort
  const deduplicated = Array.from(new Set(commonWords));
  deduplicated.sort();
  
  fs.writeFileSync(inputFilePath, JSON.stringify(deduplicated, null, 2));
  console.log(`Success! Dictionary now has ${deduplicated.length} words.`);
} catch (error) {
  console.error('Error during dictionary injection:', error);
}
