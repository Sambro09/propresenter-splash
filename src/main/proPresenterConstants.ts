import { join } from 'node:path';
import { homedir } from 'node:os';

export const PROPRESENTER_BUNDLE_ID = 'com.renewedvision.propresenter';
export const PROPRESENTER_DOWNLOAD_URL = 'https://www.renewedvision.com/propresenter/download';
export const PREFERENCES_DOMAIN = PROPRESENTER_BUNDLE_ID;
export const APPLICATION_SHOW_DIRECTORY_KEY = 'applicationShowDirectory';
export const USER_WORKSPACES_KEY = 'userWorkspaces';

export const SUPPORT_ROOT = join(
  homedir(),
  'Library',
  'Application Support',
  'RenewedVision',
  'ProPresenter'
);

export const DEFAULT_WORKSPACE_ROOT = join(SUPPORT_ROOT, 'UserWorkspaces');

export const PREFERENCES_PLIST = join(
  homedir(),
  'Library',
  'Preferences',
  `${PREFERENCES_DOMAIN}.plist`
);
