import fs from 'fs';

const data = JSON.parse(fs.readFileSync('sonarqube_top_500_issues.json', 'utf8'));
const issues = data.issues || [];

const targetRule = 'typescript:S1874';

console.log('--- S1874 Details ---');
issues.forEach(issue => {
  if (issue.rule === targetRule) {
    const path = issue.component.split(':').pop();
    console.log(`${path}: ${issue.message}`);
  }
});
