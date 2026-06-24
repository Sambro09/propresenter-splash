import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { runCopier } from './copierService';

let work: string;

async function makeConfig(root: string, files: Record<string, string>): Promise<string> {
  const config = join(root, 'Configuration');
  await mkdir(config, { recursive: true });
  for (const [name, content] of Object.entries(files)) {
    await writeFile(join(config, name), content, 'utf8');
  }
  return config;
}

beforeEach(async () => {
  work = await mkdtemp(join(tmpdir(), 'copier-test-'));
});

afterEach(async () => {
  await rm(work, { recursive: true, force: true });
});

describe('runCopier', () => {
  it('copies selected files, preserves the rest, and backs up first', async () => {
    const src = join(work, 'src');
    const tgt = join(work, 'tgt');
    await makeConfig(src, {
      Workspace: 'SRC-workspace',
      Macros: 'SRC-macros',
      Messages: 'SRC-messages',
      Stage: 'SRC-stage'
    });
    const tgtConfig = await makeConfig(tgt, {
      Workspace: 'TGT-workspace',
      Macros: 'TGT-macros',
      Stage: 'TGT-stage',
      '.DS_Store': 'noise'
    });

    const result = await runCopier({
      sourcePath: src,
      targetPaths: [tgt],
      categories: ['screens', 'macros', 'messages', 'timers']
    });

    expect(result.outcomes).toHaveLength(1);
    const outcome = result.outcomes[0];
    expect(outcome.error).toBeUndefined();
    expect(outcome.copied).toEqual(['screens', 'macros']);
    expect(outcome.skipped).toEqual(
      expect.arrayContaining([
        { category: 'messages', reason: 'no-target-file' },
        { category: 'timers', reason: 'no-source-file' }
      ])
    );

    // Selected files were copied from the source.
    expect(await readFile(join(tgtConfig, 'Workspace'), 'utf8')).toBe('SRC-workspace');
    expect(await readFile(join(tgtConfig, 'Macros'), 'utf8')).toBe('SRC-macros');
    // Unmapped file is preserved.
    expect(await readFile(join(tgtConfig, 'Stage'), 'utf8')).toBe('TGT-stage');

    const names = await readdir(tgtConfig);
    // Never invents a file the target did not have.
    expect(names).not.toContain('Messages');
    // No temp leftovers from the atomic write.
    expect(names.some((name) => name.endsWith('.copier-tmp'))).toBe(false);

    // Backup created and byte-equivalent to the original target Configuration.
    expect(outcome.backupPath).toBeTruthy();
    const backup = outcome.backupPath as string;
    expect(await readFile(join(backup, 'Workspace'), 'utf8')).toBe('TGT-workspace');
    expect(await readFile(join(backup, 'Macros'), 'utf8')).toBe('TGT-macros');
    expect(await readFile(join(backup, 'Stage'), 'utf8')).toBe('TGT-stage');
  });

  it('produces a separate backup + outcome for each target', async () => {
    const src = join(work, 'src');
    const tgtA = join(work, 'a');
    const tgtB = join(work, 'b');
    await makeConfig(src, { Workspace: 'SRC' });
    const aConfig = await makeConfig(tgtA, { Workspace: 'A' });
    const bConfig = await makeConfig(tgtB, { Workspace: 'B' });

    const result = await runCopier({
      sourcePath: src,
      targetPaths: [tgtA, tgtB],
      categories: ['screens']
    });

    expect(result.outcomes).toHaveLength(2);
    expect(await readFile(join(aConfig, 'Workspace'), 'utf8')).toBe('SRC');
    expect(await readFile(join(bConfig, 'Workspace'), 'utf8')).toBe('SRC');

    const [a, b] = result.outcomes;
    expect(a.backupPath).toBeTruthy();
    expect(b.backupPath).toBeTruthy();
    expect(a.backupPath).not.toBe(b.backupPath);
    expect(await readFile(join(a.backupPath as string, 'Workspace'), 'utf8')).toBe('A');
    expect(await readFile(join(b.backupPath as string, 'Workspace'), 'utf8')).toBe('B');
  });

  it('does not back up or copy when nothing matches', async () => {
    const src = join(work, 'src');
    const tgt = join(work, 'tgt');
    await makeConfig(src, { Workspace: 'SRC' });
    const tgtConfig = await makeConfig(tgt, { Workspace: 'TGT' });

    const result = await runCopier({
      sourcePath: src,
      targetPaths: [tgt],
      categories: ['timers'] // present in neither source nor target
    });

    const outcome = result.outcomes[0];
    expect(outcome.copied).toEqual([]);
    expect(outcome.backupPath).toBeNull();
    expect(outcome.skipped).toEqual([{ category: 'timers', reason: 'no-source-file' }]);
    // Target untouched and no backup folder created.
    expect(await readFile(join(tgtConfig, 'Workspace'), 'utf8')).toBe('TGT');
    const rootEntries = await readdir(tgt);
    expect(rootEntries.some((name) => name.startsWith('Configuration.backup-'))).toBe(false);
  });

  it('reports an error when a target has no Configuration folder', async () => {
    const src = join(work, 'src');
    const empty = join(work, 'empty');
    await makeConfig(src, { Workspace: 'SRC' });
    await mkdir(empty, { recursive: true });

    const result = await runCopier({
      sourcePath: src,
      targetPaths: [empty],
      categories: ['screens']
    });

    const outcome = result.outcomes[0];
    expect(outcome.error).toBeTruthy();
    expect(outcome.copied).toEqual([]);
    expect(outcome.backupPath).toBeNull();
  });
});
