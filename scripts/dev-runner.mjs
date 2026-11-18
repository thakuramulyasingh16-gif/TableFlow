#!/usr/bin/env node
/**
 * TableFlow Dev Server Runner
 *
 * Runs as the `dev` script in package.json following `predev` (preflight check).
 * If preflight detected an already running TableFlow server, this exits 0 cleanly.
 * Otherwise, it spawns `next dev -p 3000` to ensure Next.js never silently switches ports.
 */

import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.resolve(__dirname, '..');
const sentinelPath = path.join(rootDir, '.next', 'already-running');

if (fs.existsSync(sentinelPath)) {
  try {
    fs.unlinkSync(sentinelPath);
  } catch {
    // ignore unlink error
  }
  process.exit(0);
}

const isWindows = process.platform === 'win32';
const npxCmd = isWindows ? 'npx.cmd' : 'npx';

const child = spawn(npxCmd, ['next', 'dev', '-p', '3000'], {
  cwd: rootDir,
  stdio: 'inherit',
  shell: isWindows,
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 0);
  }
});

process.on('SIGINT', () => {
  child.kill('SIGINT');
});

process.on('SIGTERM', () => {
  child.kill('SIGTERM');
});
