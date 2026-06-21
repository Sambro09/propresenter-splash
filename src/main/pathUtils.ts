import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { normalize, resolve, sep } from 'node:path';

const HOME = homedir();

export function expandTilde(input: string): string {
  if (input === '~') {
    return HOME;
  }

  if (input.startsWith(`~${sep}`)) {
    return `${HOME}${input.slice(1)}`;
  }

  return input;
}

export function toPreferencePath(input: string): string {
  const normalized = normalizeFilePath(input);

  if (normalized === HOME) {
    return '~';
  }

  if (normalized.startsWith(`${HOME}${sep}`)) {
    return `~${normalized.slice(HOME.length)}`;
  }

  return normalized;
}

export function normalizeFilePath(input: string): string {
  const normalized = normalize(resolve(expandTilde(input)));
  return normalized.length > 1 && normalized.endsWith(sep)
    ? normalized.slice(0, -1)
    : normalized;
}

export function samePath(left: string | undefined, right: string | undefined): boolean {
  if (!left || !right) {
    return false;
  }

  return normalizeFilePath(left) === normalizeFilePath(right);
}

export function pathFromFileUrl(urlString: string | undefined): string | undefined {
  if (!urlString) {
    return undefined;
  }

  try {
    return normalizeFilePath(fileURLToPath(new URL(urlString)));
  } catch {
    return undefined;
  }
}
