import { randomBytes } from 'node:crypto';
import { runTool } from './pg';

// pg_dump and pg_restore run inside a PostgreSQL container instead of on this machine: the development computer has
// no PostgreSQL client, the containers do (docker-compose.yml). Used by `pnpm db:export` on the development database
// and by the restore tests on the test database. The tools connect over the container's own socket; the files go in
// and out with `docker cp`.

const FILE_FLAG = '-f';

/** A runTool that runs pg_dump and pg_restore in `container` */
export function containerTools(container: string): typeof runTool {
  return async (tool, args, env) => {
    if (tool !== 'pg_dump' && tool !== 'pg_restore') return runTool(tool, args, env);
    // the container's socket: no host and port; the login stays
    const local: string[] = [];
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '-h' || args[i] === '-p') i++;
      else local.push(args[i]!);
    }
    const tmp = `/tmp/marksy-${randomBytes(6).toString('hex')}`;
    if (tool === 'pg_dump') {
      const at = local.indexOf(FILE_FLAG);
      const hostPath = local[at + 1]!;
      local[at + 1] = tmp;
      try {
        await runTool('docker', ['exec', container, 'pg_dump', ...local], env);
        await runTool('docker', ['cp', `${container}:${tmp}`, hostPath], env);
      } finally {
        await runTool('docker', ['exec', container, 'rm', '-f', tmp], env).catch(() => undefined);
      }
      return;
    }
    const hostPath = local.pop()!;
    await runTool('docker', ['cp', hostPath, `${container}:${tmp}`], env);
    try {
      await runTool('docker', ['exec', container, 'pg_restore', ...local, tmp], env);
    } finally {
      await runTool('docker', ['exec', container, 'rm', '-f', tmp], env).catch(() => undefined);
    }
  };
}
