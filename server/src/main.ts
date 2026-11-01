import { serve } from './serve';

// `pnpm dev` and `pnpm start`: the server process (serve.ts). The production image starts the same function through
// its command line (cli/marksy.ts).
await serve();
