/**
 * Preflight helper utilities for TableFlow
 *
 * Safe to import in tests and scripts without side effects.
 */

import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { execSync } from 'node:child_process';

const isWindows = process.platform === 'win32';

export function parseEnvFile(filePath) {
  const result = {};
  if (!fs.existsSync(filePath)) return result;
  const content = fs.readFileSync(filePath, 'utf8');
  for (const line of content.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eqIdx = trimmed.indexOf('=');
    if (eqIdx > 0) {
      const key = trimmed.slice(0, eqIdx).trim();
      let val = trimmed.slice(eqIdx + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      result[key] = val;
    }
  }
  return result;
}

export function parsePostgresUrl(url) {
  try {
    const u = new URL(url);
    return {
      host: u.hostname || '127.0.0.1',
      port: parseInt(u.port || '5432', 10),
      database: u.pathname.replace(/^\//, '') || 'tableflow',
      username: decodeURIComponent(u.username || 'postgres'),
      password: decodeURIComponent(u.password || ''),
    };
  } catch {
    return { host: '127.0.0.1', port: 5432, database: 'tableflow', username: 'postgres', password: '' };
  }
}

export function checkEnvLocalDiff(baseDir, baseEnv) {
  const localEnvPath = path.join(baseDir, '.env.local');
  if (!fs.existsSync(localEnvPath)) return [];

  const localEnv = parseEnvFile(localEnvPath);
  const diffs = [];
  const keys = ['DATABASE_URL', 'DIRECT_URL'];

  for (const key of keys) {
    if (localEnv[key] && baseEnv[key]) {
      const parsedBase = parsePostgresUrl(baseEnv[key]);
      const parsedLocal = parsePostgresUrl(localEnv[key]);

      const baseTarget = `${parsedBase.host}:${parsedBase.port}/${parsedBase.database}`;
      const localTarget = `${parsedLocal.host}:${parsedLocal.port}/${parsedLocal.database}`;

      if (baseTarget !== localTarget) {
        diffs.push({
          key,
          envHost: parsedBase.host,
          envPort: parsedBase.port,
          envDatabase: parsedBase.database,
          localHost: parsedLocal.host,
          localPort: parsedLocal.port,
          localDatabase: parsedLocal.database,
        });
      }
    }
  }

  return diffs;
}

export function isNextDevLocked(baseDir) {
  const lockPath = path.join(baseDir, '.next', 'dev', 'lock');
  if (!fs.existsSync(lockPath)) return false;
  try {
    const fd = fs.openSync(lockPath, 'r+');
    fs.closeSync(fd);
    return false;
  } catch (err) {
    if (err && (err.code === 'EBUSY' || err.code === 'EPERM' || err.code === 'EACCES')) {
      return true;
    }
    return false;
  }
}

export function detectPortListener(port = 3000) {
  let isListening = false;
  let pid = null;
  let processName = null;

  if (isWindows) {
    try {
      const netstat = execSync('netstat -ano -p tcp', { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] });
      for (const line of netstat.split(/\r?\n/)) {
        if (line.includes(`:${port}`) && line.includes('LISTENING')) {
          const parts = line.trim().split(/\s+/);
          const foundPid = parts[parts.length - 1];
          if (foundPid && !isNaN(Number(foundPid))) {
            isListening = true;
            pid = foundPid;
            try {
              const task = execSync(`tasklist /FI "PID eq ${pid}" /FO CSV /NH`, {
                encoding: 'utf8',
                stdio: ['pipe', 'pipe', 'ignore'],
              }).trim();
              if (task && task.includes(',')) {
                processName = task.split(',')[0].replace(/"/g, '');
              }
            } catch {
              // ignore tasklist errors
            }
            break;
          }
        }
      }
    } catch {
      // fallback
    }
  } else {
    try {
      const lsof = execSync(`lsof -i :${port} -sTCP:LISTEN -t`, { encoding: 'utf8', stdio: ['pipe', 'pipe', 'ignore'] }).trim();
      if (lsof) {
        isListening = true;
        pid = lsof.split(/\r?\n/)[0].trim();
      }
    } catch {
      // fallback
    }
  }

  return { isListening, pid, processName };
}

export function testTcpPort(host, port, timeoutMs = 2000) {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let resolved = false;

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      resolved = true;
      socket.destroy();
      resolve(true);
    });
    socket.once('timeout', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });
    socket.once('error', () => {
      if (!resolved) {
        resolved = true;
        socket.destroy();
        resolve(false);
      }
    });

    socket.connect(port, host);
  });
}

export async function isTableFlowServerRunning(port = 3000) {
  const hosts = ['127.0.0.1', 'localhost', '[::1]'];
  for (const host of hosts) {
    try {
      const res = await fetch(`http://${host}:${port}/api/health`, {
        signal: AbortSignal.timeout(1200),
      });
      if (res.status === 200) {
        const data = await res.json().catch(() => null);
        if (data && (data.app === 'healthy' || data.status === 'ok')) {
          return true;
        }
      }
    } catch {
      // try next host
    }
  }
  return false;
}
