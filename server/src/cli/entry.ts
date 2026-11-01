import { run } from './marksy';

// The server image's entry point: `marksy <command>` (cli/marksy.ts)
await run(process.argv.slice(2));
