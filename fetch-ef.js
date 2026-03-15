const https = require('https');
const fs = require('fs');

https.get('https://www.ef.edu/english-resources/english-vocabulary/top-3000-words/', (res) => {
    let data = '';
    res.on('data', chunk => data += chunk);
    res.on('end', () => {
        fs.writeFileSync('ef.html', data);
        console.log("Saved to ef.html");
    });
}).on("error", (err) => {
    console.log("Error: " + err.message);
});
