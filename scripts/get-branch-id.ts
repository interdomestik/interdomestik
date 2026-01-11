import { db } from '@interdomestik/database/db';

async function main() {
  const branch = await db.query.branches.findFirst();
  if (branch) {
    console.log(`BRANCH_ID=${branch.id}`);
  } else {
    console.log('NO_BRANCH_FOUND');
  }
  process.exit(0);
}

main();
