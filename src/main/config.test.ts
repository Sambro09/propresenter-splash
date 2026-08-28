import { describe, expect, it } from 'vitest';
import { DEFAULT_SESSION_END_SETTINGS, sanitizeSessionEndSettings } from './config';

describe('sanitizeSessionEndSettings', () => {
  it('uses safe defaults when the setting is missing', () => {
    expect(sanitizeSessionEndSettings(undefined)).toEqual(DEFAULT_SESSION_END_SETTINGS);
  });

  it('preserves a valid configured end screen', () => {
    expect(
      sanitizeSessionEndSettings({
        systemAction: 'shutdown'
      })
    ).toEqual({
      systemAction: 'shutdown'
    });
  });

  it('defaults a malformed action and ignores retired fields', () => {
    expect(
      sanitizeSessionEndSettings({
        systemAction: 'restart',
        showMostRecentWorkspace: false,
        showOtherWorkspace: false
      })
    ).toEqual({
      systemAction: 'logout'
    });
  });
});
