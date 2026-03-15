const fs = require('fs');
const path = require('path');
const sowpods = require('sowpods');

const outputPath = path.join(__dirname, 'src', 'lib', 'sowpods-static.json');

fs.writeFileSync(outputPath, JSON.stringify(sowpods));
console.log('Successfully generated static SOWPODS json payload for the frontend.');
