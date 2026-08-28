import { describe, expect, it } from 'vitest';
import { firstRunLoginItemAction } from './loginItemSetup';

describe('firstRunLoginItemAction', () => {
  it('does nothing after first-run setup is complete', () => {
    expect(
      firstRunLoginItemAction(true, {
        openAtLogin: false,
        status: 'not-registered'
      })
    ).toBe('none');
  });

  it('records an existing enabled login item without prompting', () => {
    expect(
      firstRunLoginItemAction(false, {
        openAtLogin: true,
        status: 'enabled'
      })
    ).toBe('mark-complete');
  });

  it('requests permission when Launch at Login is not registered', () => {
    expect(
      firstRunLoginItemAction(false, {
        openAtLogin: false,
        status: 'not-registered'
      })
    ).toBe('request-permission');
  });

  it('requests permission again when registration still needs approval', () => {
    expect(
      firstRunLoginItemAction(false, {
        openAtLogin: false,
        status: 'requires-approval'
      })
    ).toBe('request-permission');
  });
});
