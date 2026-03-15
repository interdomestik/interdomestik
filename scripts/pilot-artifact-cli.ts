function createArgParser(argKeys, createEmptyArgs) {
  return function parseArgs(argv) {
    const parsed = createEmptyArgs();

    for (let index = 0; index < argv.length; index += 1) {
      const token = argv[index];
      const next = argv[index + 1];

      if (token === '--help' || token === '-h') {
        parsed.help = true;
        break;
      }

      const key = argKeys[token];
      if (key && next) {
        parsed[key] = next;
        index += 1;
      }
    }

    return parsed;
  };
}

function runCli(main) {
  try {
    if (require.main === module.parent) {
      main();
    }
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}

module.exports = {
  createArgParser,
  runCli,
};
