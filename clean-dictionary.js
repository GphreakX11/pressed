const fs = require('fs');
const path = require('path');
// SOWPODS is a standard Scrabble dictionary that strictly excludes proper nouns
const sowpods = require('sowpods'); 

// 1. Define your file paths (Update these if your folder structure is different)
const inputFilePath = path.join(__dirname, 'src', 'lib', 'commonWords.json');
const outputFilePath = path.join(__dirname, 'src', 'lib', 'clean-words.json');

async function cleanDictionary() {
  console.log('Starting dictionary cleanup...');

  try {
    // 2. Load your current "common words" dataset (the one that includes names)
    const rawData = fs.readFileSync(inputFilePath, 'utf8');
    const commonWords = JSON.parse(rawData);
    
    console.log(`Loaded ${commonWords.length} words from the common list.`);

    // 3. Convert SOWPODS array to a Set for lightning-fast lookups
    // SOWPODS words are uppercase by default, so we normalize them to lowercase
    const validScrabbleWords = new Set(sowpods.map(word => word.toLowerCase()));
    
    // 4. Filter the list: Keep the word ONLY if it exists in the SOWPODS Set
    const cleanedWords = commonWords.filter(word => {
      const normalizedWord = word.toLowerCase();
      return validScrabbleWords.has(normalizedWord);
    });

    console.log(`Filtering complete. Removed ${commonWords.length - cleanedWords.length} invalid words/proper nouns.`);
    console.log(`New dictionary size: ${cleanedWords.length} words.`);

    // 5. Write the newly sanitized list to a new JSON file
    fs.writeFileSync(outputFilePath, JSON.stringify(cleanedWords, null, 2));
    
    console.log(`Success! Clean dictionary saved to ${outputFilePath}`);

  } catch (error) {
    console.error('Error during dictionary cleanup:', error);
    console.log('Ensure you have a valid JSON array of strings at the inputFilePath.');
  }
}

cleanDictionary();
