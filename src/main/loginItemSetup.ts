export type LoginItemStatus =
  | 'not-registered'
  | 'enabled'
  | 'requires-approval'
  | 'not-found';

export type FirstRunLoginItemAction = 'none' | 'mark-complete' | 'request-permission';

export function firstRunLoginItemAction(
  setupComplete: boolean,
  current: { openAtLogin: boolean; status: LoginItemStatus }
): FirstRunLoginItemAction {
  if (setupComplete) {
    return 'none';
  }
  if (current.openAtLogin || current.status === 'enabled') {
    return 'mark-complete';
  }
  return 'request-permission';
}
