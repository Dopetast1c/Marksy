import { readFileSync } from 'node:fs';

// The running version (docs/build-plan.md, Versions). An image carries it in MARKSY_VERSION and MARKSY_COMMIT, set when
// it was built; a development run reads the workspace's package.json and says "dev" for the commit.

export interface AppVersion {
  version: string;
  commit: string;
}

function workspaceVersion(): string {
  try {
    const pkg = JSON.parse(readFileSync(new URL('../../../package.json', import.meta.url), 'utf8')) as {
      version?: string;
    };
    return pkg.version ?? '0.0.0';
  } catch {
    return '0.0.0';
  }
}

export function appVersion(env: NodeJS.ProcessEnv = process.env): AppVersion {
  return {
    version: env.MARKSY_VERSION?.trim() || workspaceVersion(),
    commit: env.MARKSY_COMMIT?.trim().slice(0, 12) || 'dev',
  };
}
