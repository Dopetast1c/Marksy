import { z } from 'zod';

// Zod compiles object schemas with `new Function` when it may, and finds out by trying, which the production policy
// (no eval, docker/web/web.Caddyfile) reports as a violation. The web app never needs the speed: it parses small
// answers, so the schemas run without compiling. Imported first in main.tsx, before any schema parses.
z.config({ jitless: true });
