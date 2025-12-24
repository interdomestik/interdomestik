const fs = require('fs');
const path = require('path');

const locales = ['en', 'sq', 'mk', 'sr'];
const baseDir = 'apps/web/src/messages';

locales.forEach(locale => {
  const dir = path.join(baseDir, locale);
  if (fs.existsSync(dir)) {
    fs.readdir(dir, (err, files) => {
      if (err) return console.error(err);
      files.forEach(file => {
        if (path.extname(file) === '.json') {
          const filePath = path.join(dir, file);
          const content = fs.readFileSync(filePath, 'utf8');
          try {
            JSON.parse(content);
          } catch (e) {
            console.error(`❌ ${locale}/${file} is INVALID: ${e.message}`);
          }
        }
      });
    });
  }
});
