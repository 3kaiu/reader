import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceDir = path.resolve(scriptDir, '..');

const candidates = [
  path.join(workspaceDir, 'node_modules', 'typescript', 'bin', 'tsc'),
  path.join(workspaceDir, '..', 'nexus-reader', 'node_modules', 'typescript', 'bin', 'tsc'),
];

const tscPath = candidates.find(candidate => existsSync(candidate));

if (!tscPath) {
  console.error('Unable to locate a TypeScript compiler for cloudflare-workers type-check.');
  console.error('Expected one of:');
  for (const candidate of candidates) {
    console.error(`- ${candidate}`);
  }
  process.exit(1);
}

const result = spawnSync(process.execPath, [tscPath, '--project', 'tsconfig.json'], {
  cwd: workspaceDir,
  stdio: 'inherit',
});

process.exit(result.status ?? 1);
