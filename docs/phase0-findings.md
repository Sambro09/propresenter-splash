# Phase 0 Findings

Date: 2026-06-21
Machine state: ProPresenter 21.4 installed locally

## Result

The primary approach is validated for ProPresenter 21.4 on this machine.

With ProPresenter closed, externally writing the active workspace preferences to `Youth` and
then launching ProPresenter caused ProPresenter to start with `Youth` active. After startup,
ProPresenter updated workspace-specific saved playlist keys from `Kids` to `Youth`, then
preserved the `Youth` active state after quit.

The machine was restored to the original baseline afterward:

- ProPresenter is closed.
- Active workspace is back to `Kids`.
- The restored preference snapshot matches the baseline snapshot.

Phase 0 artifacts were kept outside the repo at:

```text
/tmp/propresenter-splash-phase0-20260621-004746
```

## Confirmed Local Paths And Identifiers

- App path: `~/Applications/ProPresenter.app`
- Bundle identifier: `com.renewedvision.propresenter`
- Version: `21.4` / `21.4.0`
- Preferences domain: `com.renewedvision.propresenter`
- Preferences file: `~/Library/Preferences/com.renewedvision.propresenter.plist`
- Support root: `~/Library/Application Support/RenewedVision/ProPresenter`
- User workspace root: `~/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces`

These differ from the original draft spec:

- Use lowercase `com.renewedvision.propresenter`, not `com.renewedvision.ProPresenter`.
- Use `UserWorkspaces`, not `User Workspaces`.

## Confirmed Workspace Registry

The installed workspace registry lives in the `userWorkspaces` preference. It is stored as
`NSData`; the bytes are a JSON array.

Decoded shape:

```json
[
  {
    "name": "Kids",
    "minimumRequiredProPresenterVersion": "22.0.0",
    "isActive": true,
    "url": "file:///Users/sam/Library/Application%20Support/RenewedVision/ProPresenter/UserWorkspaces/Kids/"
  }
]
```

The real value contains one object per workspace. Exactly one workspace should have
`isActive: true`.

Observed workspaces:

- `Facilities`
- `Kids`
- `Traditions`
- `Youth`

## Confirmed Active-Workspace Write Contract

To switch workspaces externally while ProPresenter is closed, update both:

1. `applicationShowDirectory`
2. `userWorkspaces`

Example target: `Youth`.

```sh
defaults write com.renewedvision.propresenter applicationShowDirectory \
  -string "~/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/Youth"

defaults write com.renewedvision.propresenter userWorkspaces -data "<hex-encoded-json-bytes>"
```

For `userWorkspaces`, decode the current JSON, preserve every existing workspace object, and
only change `isActive` so the selected workspace is `true` and all others are `false`. Then
write the UTF-8 JSON bytes as `NSData`.

ProPresenter accepted normal `JSON.stringify` output with unescaped `/` characters. On launch,
it normalized the preference data back to its own serialized style.

## Launch Verification

Test sequence:

1. Confirmed the main `ProPresenter` process was not running.
2. Backed up/exported baseline preferences.
3. Wrote `applicationShowDirectory` and `userWorkspaces` to select `Youth`.
4. Re-read preferences and confirmed `Youth` was externally active.
5. Launched `~/Applications/ProPresenter.app`.
6. Waited for startup and exported preferences while ProPresenter was running.
7. Quit ProPresenter through AppleScript.
8. Exported preferences after quit.
9. Restored the original baseline.

Evidence that ProPresenter read the external value:

- `applicationShowDirectory` remained set to `Youth` while running.
- Decoded `userWorkspaces` still marked `Youth` active while running.
- `savedCurrentLibraryPlaylistURLKey` changed from the `Kids` library path to the `Youth`
  library path during ProPresenter startup.
- After quit, `Youth` remained active and was not reverted.

## Write Scope For The App

The app should write only the two confirmed active-workspace values:

- `applicationShowDirectory`
- `userWorkspaces`

It should not write these ProPresenter-owned follow-on keys:

- `savedCurrentLibraryPlaylistURLKey`
- `savedCurrentAudioPlaylistUUIDKey`
- `savedCurrentMediaPlaylistUUIDKey`
- `searchPaths`
- `renderClockSourceKey`

Those changed or normalized during ProPresenter startup and should remain under ProPresenter's
control.

## Process-Control Notes

ProPresenter helper processes may stay running while the main app is closed:

- `ProPresenter Helper (Workspaces)`
- `ProPresenter Helper (Snapshots)`

Do not use loose process-name matching for running-state detection. The app should detect the
exact main process or ask Launch Services/AppleScript whether the `ProPresenter` application is
running.

Confirmed checks:

```sh
pgrep -x ProPresenter
osascript -e 'application "ProPresenter" is running'
```

Confirmed graceful quit:

```sh
osascript -e 'tell application id "com.renewedvision.propresenter" to quit'
```

The quit took roughly 15 seconds in the spike, so the app should use a timeout above 10 seconds
or make the timeout configurable.

## Remaining Caveats

- This spike validated external write -> launch -> quit behavior. It did not perform a manual
  in-app Active Workspace switch and diff that specific UI action.
- The `minimumRequiredProPresenterVersion` values were `22.0.0` even though the app version is
  `21.4.0`; do not use that field for app compatibility gating.
- The confirmed behavior applies to this local ProPresenter 21.4 install. Future ProPresenter
  versions may change the schema.

## Implementation Implications

The app can now proceed to Phase 1 with switching enabled behind a version/schema self-check:

- Resolve bundle id `com.renewedvision.propresenter`.
- Scan `UserWorkspaces`.
- Decode `userWorkspaces` as the preferred source of workspace names and active state.
- Fall back to folder names if the registry is missing or malformed.
- When switching, require ProPresenter to be closed before writing preferences.
- Write both active-workspace keys, re-read them, then launch ProPresenter.
- Abort rather than launching if the post-write readback does not match the selected workspace.
