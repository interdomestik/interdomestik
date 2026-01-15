const fs = require('fs');
const path = require('path');

const messagesDir = path.join(process.cwd(), 'apps/web/src/messages');
const locales = ['en', 'sq', 'mk', 'sr']; // inferred from list_dir

function checkJson(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    JSON.parse(content);
  } catch (e) {
    console.error(`Invalid JSON in ${filePath}: ${e.message}`);
    process.exit(1);
  }
}

function traverse(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    if (fs.statSync(fullPath).isDirectory()) {
      traverse(fullPath);
    } else if (file.endsWith('.json')) {
      checkJson(fullPath);
    }
  }
}

if (fs.existsSync(messagesDir)) {
  traverse(messagesDir);
  console.log('All JSON files in messages valid.');
} else {
  console.log('Messages directory not found.');
}
