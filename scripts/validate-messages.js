const fs = require('fs');
const path = require('path');

function walk(dir, callback) {
  const files = fs.readdirSync(dir);
  files.forEach(file => {
    const filepath = path.join(dir, file);
    const stats = fs.statSync(filepath);
    if (stats.isDirectory()) {
      walk(filepath, callback);
    } else if (file.endsWith('.json')) {
      callback(filepath);
    }
  });
}

const messagesDir = path.resolve(__dirname, '../apps/web/src/messages');
console.log(`Scanning ${messagesDir}...`);

let errors = 0;
walk(messagesDir, filepath => {
  try {
    const content = fs.readFileSync(filepath, 'utf8');
    JSON.parse(content);
  } catch (err) {
    console.error(`❌ Error in ${filepath}: ${err.message}`);
    errors++;
  }
});

if (errors === 0) {
  console.log('✅ All JSON files are valid.');
} else {
  console.log(`found ${errors} errors`);
  process.exit(1);
}
