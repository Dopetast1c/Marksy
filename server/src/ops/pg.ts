import { spawn } from 'node:child_process';

// pg_dump and pg_restore of the database in DATABASE_URL (the server image carries the PostgreSQL 16 client). The
// password goes to the tools in PGPASSWORD, never on a command line or in a message: an error names the tool and its
// exit code, and the last line it printed with any address of the database taken out.

export interface PgTarget {
  args: string[];
  env: NodeJS.ProcessEnv;
  database: string;
}

export function pgTarget(databaseUrl: string): PgTarget {
  const url = new URL(databaseUrl);
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  return {
    args: ['-h', url.hostname, '-p', url.port || '5432', '-U', decodeURIComponent(url.username)],
    env: { ...process.env, PGPASSWORD: decodeURIComponent(url.password), PGCONNECT_TIMEOUT: '10' },
    database,
  };
}

/** Runs one tool to the end; rejects with a message that carries no address, login or password */
export function runTool(tool: string, args: string[], env: NodeJS.ProcessEnv): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(tool, args, { env, stdio: ['ignore', 'ignore', 'pipe'] });
    let tail = '';
    child.stderr.on('data', (chunk: Buffer) => {
      tail = (tail + chunk.toString('utf8')).slice(-2000);
    });
    child.on('error', (err) =>
      reject(new Error(`${tool} could not start (${(err as { code?: string }).code ?? 'error'})`)),
    );
    child.on('close', (code) => {
      if (code === 0) return resolve();
      const last = tail.trim().split('\n').pop() ?? '';
      const clean = last.replace(/postgres(ql)?:\/\/\S+/g, '<database>').replace(/"[^"]*"/g, '"…"');
      reject(new Error(`${tool} exited with ${code}${clean ? `: ${clean}` : ''}`));
    });
  });
}
