import fs from 'fs';

const data = JSON.parse(fs.readFileSync('sonarqube_top_500_issues.json', 'utf8'));
const issues = data.issues || [];

const ruleCounts = {};
const ruleNames = {};

issues.forEach(issue => {
  const rule = issue.rule;
  ruleCounts[rule] = (ruleCounts[rule] || 0) + 1;
  ruleNames[rule] = issue.message; // Just a sample message
});

console.log(`Total issues: ${issues.length}`);
console.log('Top rules:');

Object.entries(ruleCounts)
  .sort(([, a], [, b]) => b - a)
  .forEach(([rule, count]) => {
    console.log(`${rule}: ${count} - ${ruleNames[rule]}`);
  });
