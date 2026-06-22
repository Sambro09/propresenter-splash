import { app } from 'electron';
import { appendFile, mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';

export function getSupportLogPath(): string {
  return join(app.getPath('userData'), 'propresenter-splash.log');
}

async function writeLog(level: 'INFO' | 'ERROR', message: string, detail?: unknown): Promise<void> {
  const line = [
    new Date().toISOString(),
    level,
    message,
    detail === undefined ? undefined : serializeDetail(detail)
  ]
    .filter(Boolean)
    .join(' ');

  const logPath = getSupportLogPath();
  await mkdir(dirname(logPath), { recursive: true });
  await appendFile(logPath, `${line}\n`, 'utf8');
}

function serializeDetail(detail: unknown): string {
  if (detail instanceof Error) {
    return JSON.stringify({
      name: detail.name,
      message: detail.message,
      stack: detail.stack
    });
  }

  try {
    return JSON.stringify(detail);
  } catch {
    return String(detail);
  }
}

export async function logInfo(message: string, detail?: unknown): Promise<void> {
  await writeLog('INFO', message, detail).catch(() => undefined);
}

export async function logError(message: string, detail?: unknown): Promise<void> {
  await writeLog('ERROR', message, detail).catch(() => undefined);
}
