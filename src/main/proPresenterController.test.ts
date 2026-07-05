import { describe, expect, it } from 'vitest';
import { parseProPresenterWindowState } from './proPresenterController';

describe('parseProPresenterWindowState', () => {
  it('accepts known window states from AppleScript output', () => {
    expect(parseProPresenterWindowState('foreground\n')).toBe('foreground');
    expect(parseProPresenterWindowState('BACKGROUND')).toBe('background');
    expect(parseProPresenterWindowState(' minimized ')).toBe('minimized');
  });

  it('falls back to unknown for empty or unexpected output', () => {
    expect(parseProPresenterWindowState('')).toBe('unknown');
    expect(parseProPresenterWindowState('not-authorized')).toBe('unknown');
  });
});
