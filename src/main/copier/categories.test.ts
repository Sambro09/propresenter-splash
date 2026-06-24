import { describe, expect, it } from 'vitest';
import {
  backupFolderName,
  categoryById,
  configurationFiles,
  fileForCategory,
  isNoiseFile,
  matchedCategories,
  planCopy
} from './categories';

describe('isNoiseFile / configurationFiles', () => {
  it('treats .DS_Store and AppleDouble files as noise', () => {
    expect(isNoiseFile('.DS_Store')).toBe(true);
    expect(isNoiseFile('._Workspace')).toBe(true);
    expect(isNoiseFile('Workspace')).toBe(false);
  });

  it('filters noise and sorts the remaining files', () => {
    expect(configurationFiles(['Workspace', '.DS_Store', '._Macros', 'Macros'])).toEqual([
      'Macros',
      'Workspace'
    ]);
  });
});

describe('matchedCategories', () => {
  it('matches mapped files case-insensitively and ignores unknown/noise', () => {
    const matched = matchedCategories(['workspace', 'Macros', 'Stage', '.DS_Store', 'Unknown']);
    expect(matched).toContain('screens'); // Workspace
    expect(matched).toContain('macros');
    expect(matched).not.toContain('timers'); // no Timers file
    expect(matched).not.toContain('looks'); // no Looks file
  });

  it('reports no Looks when the file is absent (matches real exports)', () => {
    const matched = matchedCategories(['Workspace', 'Macros', 'Props', 'Messages', 'Timers']);
    expect(matched).not.toContain('looks');
    expect(matched).toEqual(
      expect.arrayContaining(['screens', 'macros', 'props', 'messages', 'timers'])
    );
  });
});

describe('fileForCategory / categoryById', () => {
  it('maps category ids to their Configuration file', () => {
    expect(fileForCategory('screens')).toBe('Workspace');
    expect(fileForCategory('macros')).toBe('Macros');
    expect(fileForCategory('timers')).toBe('Timers');
  });

  it('throws on an unknown category', () => {
    // @ts-expect-error intentionally invalid id
    expect(() => categoryById('nope')).toThrow();
  });
});

describe('planCopy (replace-only)', () => {
  it('copies only categories present in BOTH source and target', () => {
    const plan = planCopy(
      ['screens', 'macros', 'messages'],
      ['screens', 'macros'], // present in source
      ['screens', 'messages'] // present in target
    );
    expect(plan).toEqual([
      { category: 'screens', action: 'copy' },
      { category: 'macros', action: 'no-target-file' },
      { category: 'messages', action: 'no-source-file' }
    ]);
  });

  it('only plans the selected categories', () => {
    const plan = planCopy(['macros'], ['screens', 'macros'], ['screens', 'macros']);
    expect(plan).toEqual([{ category: 'macros', action: 'copy' }]);
  });

  it('reports zero-match categories as skips, not copies', () => {
    expect(planCopy(['looks'], [], [])).toEqual([{ category: 'looks', action: 'no-source-file' }]);
  });
});

describe('backupFolderName', () => {
  it('produces a stable, predictable name', () => {
    expect(backupFolderName('20260624-141530')).toBe('Configuration.backup-20260624-141530');
  });
});
