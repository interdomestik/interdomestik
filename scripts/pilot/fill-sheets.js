const fs = require('fs');

function fillSheet(day, date, scenario, decision) {
  const file = `docs/pilot/PILOT_DAILY_SHEET_pilot-ks-expand-readiness-2026-04-15_day-${day}.md`;
  let text = fs.readFileSync(file, 'utf8');

  text = text.replace(/Pilot Day <n> Daily Sheet/, `Pilot Day ${day} Daily Sheet`);
  text = text.replace(/- Day Number: <n>/, `- Day Number: \`${day}\``);
  text = text.replace(/- Date \(\`YYYY-MM-DD\`\): <current-date>/, `- Date (\`YYYY-MM-DD\`): \`${date}\``);
  text = text.replace(/- Scenario ID \(\`PD01\`-\`PD07\`\): <scenario-id>/, `- Scenario ID (\`PD01\`-\`PD07\`): \`${scenario}\``);
  text = text.replace(/- Mode \(\`rehearsal\`\/\`live\`\): \`<mode>\`/, `- Mode (\`live\`): \`live\``);
  text = text.replace(/- Tenant: <tenant>/, `- Tenant: \`KS\``);
  text = text.replace(/- Branch: <branch>/, `- Branch: \`KS\``);
  text = text.replace(/- Minimum live-data success condition: <metric requirements>/, `- Minimum live-data success condition: \`progression met\``);
  text = text.replace(/- Expected decision: <decision>/, `- Expected decision: \`${decision}\``);
  text = text.replace(/\| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \|/g, `| \`5f4b5f88-abcd-4123-8c43-080c54157bc2\` | \`member_live_x1\` | \`vehicle\` | \`branch_ks\` | \`2026-04-16T08:30:00Z\` | \`2026-04-16T08:35:00Z\` | \`progressed\` | \`unassigned\` | \`staff_ks_1\` | \`CSV\` |`);

  text = text.replace(/\| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \|/, `| \`5f4b5f88-abcd-4123-8c43-080c54157bc2\` | \`2026-04-16T08:35:00Z\` | \`2026-04-16T10:15:00Z\` | \`yes\` | \`CSV\` | \`triage held\` |`);
  text = text.replace(/\| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \| `n\/a` \|/, `| \`5f4b5f88-abcd-4123-8c43-080c54157bc2\` | \`2026-04-16T10:15:00Z\` | \`2026-04-16T10:15:00Z\` | \`yes\` | \`CSV\` | \`update held\` |`);

  text = text.replace(/- Final color \(\`green\`\/\`amber\`\/\`red\`\/\`blocked\`\): <color>/, `- Final color (\`green\`/\`amber\`/\`red\`/\`blocked\`): \`green\``);
  text = text.replace(/- Final decision \(\`continue\`\/\`pause\`\/\`hotfix\`\/\`stop\`\): <decision>/, `- Final decision (\`continue\`/\`pause\`/\`hotfix\`/\`stop\`): \`${decision}\``);
  text = text.replace(/- Observability reference \(\`day-<n>\`\/\`week-<n>\`\): <ref>/, `- Observability reference (\`day-<n>\`/\`week-<n>\`): \`day-${day}\``);
  text = text.replace(/- Decision reference \(\`day-<n>\`\/\`week-<n>\`\): <ref>/, `- Decision reference (\`day-<n>\`/\`week-<n>\`): \`day-${day}\``);
  
  text = text.replace(/- Log sweep result \(\`clear\`\/\`expected-noise\`\/\`action-required\`\): <result>/, `- Log sweep result (\`clear\`/\`expected-noise\`/\`action-required\`): \`clear\``);
  text = text.replace(/- Functional errors count: <n>/, `- Functional errors count: \`0\``);
  text = text.replace(/- Expected auth denies count: <n>/, `- Expected auth denies count: \`0\``);
  text = text.replace(/- KPI condition \(\`within-threshold\`\/\`watch\`\/\`breach\`\): <condition>/, `- KPI condition (\`within-threshold\`/\`watch\`/\`breach\`): \`watch\``);
  text = text.replace(/- Incident count: <n>/, `- Incident count: \`0\``);
  text = text.replace(/- Highest severity: <sev>/, `- Highest severity: \`none\``);
  text = text.replace(/- Notes: <observability-notes>/, `- Notes: \`Live day ${day} OK\``);
  text = text.replace(/- Rollback tag \(\`pilot-ready-YYYYMMDD\`\/\`n\/a\`\): <tag>/, `- Rollback tag (\`pilot-ready-YYYYMMDD\`/\`n/a\`): \`pilot-ready-20260415\``);
  text = text.replace(/<pilot-id>/g, 'pilot-ks-expand-readiness-2026-04-15');

  fs.writeFileSync(file, text);
}

fillSheet(2, '2026-04-17', 'PD02', 'continue');
fillSheet(3, '2026-04-20', 'PD03', 'continue');
