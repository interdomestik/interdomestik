import fs from 'fs';

const data = JSON.parse(fs.readFileSync('sonarqube_top_500_issues.json', 'utf8'));
const issues = data.issues || [];

const targetRule = 'typescript:S1874';
const files = [];

issues.forEach(issue => {
  if (issue.rule === targetRule) {
    // issue.component is like "interdomestikv2:apps/web/src/..."
    // we want relative path
    const path = issue.component.split(':').pop();
    if (!files.includes(path)) {
      files.push(path);
    }
  }
});

console.log(`Files with ${targetRule} (${files.length}):`);
files.sort().forEach(f => console.log(f));
