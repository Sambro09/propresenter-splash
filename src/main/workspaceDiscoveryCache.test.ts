import { describe, expect, it } from 'vitest';
import { parseWorkspaceDiscoveryCache } from './workspaceDiscoveryCache';

function validCache(): Record<string, unknown> {
  return {
    version: 1,
    refreshedAt: '2026-08-27T20:00:00.000Z',
    scan: {
      workspaceRoot: '/workspaces',
      isCustomWorkspaceRoot: false,
      activeWorkspaceId: '/workspaces/Sunday',
      activeWorkspaceName: 'Sunday',
      workspaces: [
        {
          id: '/workspaces/Sunday',
          key: '/workspaces/Sunday',
          name: 'Sunday',
          path: '/workspaces/Sunday',
          isActive: true,
          isPinned: false,
          source: 'registry',
          isCustomized: false
        }
      ],
      errors: []
    },
    proPresenter: {
      installed: true,
      running: false,
      appPath: '/Applications/ProPresenter.app'
    }
  };
}

describe('parseWorkspaceDiscoveryCache', () => {
  it('accepts a complete cache snapshot', () => {
    const cache = parseWorkspaceDiscoveryCache(JSON.stringify(validCache()));

    expect(cache?.scan.workspaces).toHaveLength(1);
    expect(cache?.scan.workspaces[0]?.name).toBe('Sunday');
  });

  it('rejects malformed JSON and unsupported cache versions', () => {
    expect(parseWorkspaceDiscoveryCache('{')).toBeUndefined();
    expect(
      parseWorkspaceDiscoveryCache(JSON.stringify({ ...validCache(), version: 2 }))
    ).toBeUndefined();
  });

  it('rejects incomplete workspace data instead of exposing it to the renderer', () => {
    const cache = validCache();
    const scan = cache.scan as Record<string, unknown>;
    const [workspace] = scan.workspaces as Array<Record<string, unknown>>;
    delete workspace.path;

    expect(parseWorkspaceDiscoveryCache(JSON.stringify(cache))).toBeUndefined();
  });
});
