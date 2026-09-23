import { readFileSync } from 'fs';
import { join } from 'path';

export interface VersionInfo {
  version: string;
  gitCommit: string;
  gitBranch: string;
}

/**
 * Liest die App-Version aus package.json und den Git-Stand aus den von Render
 * automatisch gesetzten Env-Vars (RENDER_GIT_COMMIT/RENDER_GIT_BRANCH).
 * Lokal (kein Render) gibt es dafür 'local' zurück.
 */
export function getVersionInfo(): VersionInfo {
  let version = '0.0.0';
  try {
    const pkg = JSON.parse(
      readFileSync(join(process.cwd(), 'package.json'), 'utf8'),
    ) as { version?: string };
    version = pkg.version || version;
  } catch {
    // package.json nicht lesbar - Fallback-Version verwenden
  }

  return {
    version,
    gitCommit: (process.env.RENDER_GIT_COMMIT || 'local').substring(0, 12),
    gitBranch: process.env.RENDER_GIT_BRANCH || 'local',
  };
}
