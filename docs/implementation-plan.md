# ProPresenter Workspace Launcher Implementation Plan

Status: launcher implemented; release/update infrastructure configured
Date: 2026-06-21

## Current State

The repository now contains an Electron + TypeScript + Vite app with a React renderer.
The implementation follows the Phase 0 write contract from `docs/phase0-findings.md`:

- Read workspaces from the configured `UserWorkspaces` folder.
- Decode ProPresenter's `userWorkspaces` preference as the preferred source of names and
  active state.
- Write only `applicationShowDirectory` and `userWorkspaces` when switching workspaces.
- Use `defaults` writes and readback verification rather than raw plist mutation.
- Launch ProPresenter by resolved app path after the active-workspace write succeeds.

## Operator Workflow Plan

The app should make the Sunday/operator flow feel like this:

1. A volunteer logs into the shared presentation Mac.
2. The launcher is the only thing they need to look at.
3. They click the workspace for their service or ministry.
4. ProPresenter opens in that workspace.
5. When they are done, they quit ProPresenter.
6. The Mac clearly guides them to log out or choose another workspace.

The launcher is not meant to replace ProPresenter after launch. It is the controlled handoff
point between macOS login and the correct ProPresenter workspace.

### Mac setup

Recommended setup for each presentation Mac:

- Install the signed/notarized launcher in `/Applications`.
- Add the launcher as the only user-facing Login Item for the shared presentation account.
- Remove ProPresenter from Login Items so it never opens before a workspace is selected.
- Keep the shared account clean: no browser, chat, updater, or cloud-sync windows should open at
  login.
- Configure the launcher once with the correct `UserWorkspaces` folder if ProPresenter support
  files are relocated.
- Give workspaces volunteer-friendly names, such as `Sunday AM`, `Sunday PM`, `Youth`, or
  `Spanish Service`.
- Keep an admin/support escape path available through the macOS menu bar or an admin shortcut.

This should be treated as a "focused login" flow, not true macOS Single App Mode for v1. A hard
single-app lock conflicts with the desired handoff because the operator must leave the launcher
and use ProPresenter. If the church later needs device-management enforcement, evaluate that as a
separate MDM/admin feature instead of baking it into the basic launcher.

### Volunteer flow

The volunteer should not need to know where ProPresenter stores workspaces or how to switch them
inside Settings.

1. Log into the presentation Mac.
2. Wait for the launcher to appear.
3. Click the correct workspace.
4. If ProPresenter is already open, save any work when prompted, then confirm the switch.
5. Use ProPresenter normally.
6. At the end, quit ProPresenter and log out of macOS.

Expected behavior:

- If ProPresenter is closed, one click should set the workspace and open ProPresenter.
- If ProPresenter is open in the same workspace, clicking that workspace should simply bring
  ProPresenter forward.
- If ProPresenter is open in a different workspace, the launcher should warn the operator to save,
  then quit, switch, and relaunch.
- If something is wrong, the app should keep the operator in the launcher and show a clear support
  action instead of opening ProPresenter into an unknown workspace.

### Admin/support flow

Admins should have a separate path for setup and repair:

- Use Edit Mode to rename or repoint workspaces.
- Use Choose Folder when the ProPresenter workspace root moved.
- Use Rescan after adding or removing workspaces in ProPresenter.
- Use Copy Details on errors before changing files manually.
- Verify after ProPresenter updates that the active-workspace preference contract still works.

Edit and support tools should stay out of the normal volunteer path. Volunteers should see a
simple list first, with support actions appearing only when something fails.

## Ways To Make The App Meet This Workflow

### P0 before church rollout

- **Launch at login:** add an app setting or deployment script that registers the launcher as a
  Login Item, and document that ProPresenter must not also be a Login Item.
- **Operator/startup mode:** add a configuration flag that opens the launcher as a focused,
  centered or full-screen window on login. It should be visually dominant enough that the user
  naturally starts there without needing a true kiosk lock.
- **Clean first screen:** show only the workspace choices, active badge, and necessary error
  banners in normal mode. Keep folder paths, edit controls, and support details hidden unless
  Admin/Edit Mode is enabled or an error occurs.
- **Workspace ordering:** allow admins to set a fixed order or pin important workspaces so the
  most common service is always in the same place.
- **End-of-session prompt:** after the launcher opens ProPresenter, keep the launcher process
  alive in the background and watch for ProPresenter to quit. When it quits, show a simple screen:
  `Log Out`, `Choose Another Workspace`, and `Reopen Last Workspace`.
- **Logout handoff:** make `Log Out` open the standard macOS logout confirmation instead of
  forcing an immediate logout. This keeps the app from destroying unsaved work in other apps.

### P1 soon after rollout

- **Admin lock:** require an admin gesture or password before Edit Mode, custom folder changes,
  or workspace path overrides are available.
- **Health check panel:** show setup problems before volunteers arrive: ProPresenter missing,
  no workspaces found, ProPresenter already running at login, active workspace unreadable, or
  workspace preference write failing.
- **Per-machine config export/import:** let an admin prepare one machine and copy launcher
  config to the rest.
- **Better workspace labels:** support display names and optional short descriptions like
  `Main Auditorium`, `Youth Room`, or `Special Event`.
- **Session recovery:** if the Mac reboots while ProPresenter was open, the launcher should
  still appear first on next login and ask the operator to choose a workspace again.

### P2 later

- **Managed deployment support:** provide a signed installer package and MDM notes for churches
  with multiple Macs.
- **Optional usage analytics:** only if a privacy policy and stakeholder decision exist; local
  logging is enough for v1.
- **Workspace metadata:** show last used time or modified time if it helps operators choose, but
  avoid making "recent" the primary signal because recurring services should stay predictable.
- **True locked-down mode:** evaluate macOS management options only if there is a real need to
  prevent access to other apps. This is separate from the launcher handoff workflow.

## Operational Acceptance Criteria

- On login, the launcher appears automatically without ProPresenter opening first.
- A volunteer can open the correct workspace without using ProPresenter Settings.
- The launcher never silently opens ProPresenter after a failed workspace switch.
- If ProPresenter was already running, the user sees one save warning in the launcher.
- After ProPresenter quits, the user is guided to log out or choose another workspace.
- Admin controls are discoverable for support but not prominent in normal volunteer use.
- The setup can be repeated on another Mac from documented steps.

## Implemented Phases

### Phase 1: MVP Launcher

Implemented:

- Electron app scaffold with isolated preload bridge and `nodeIntegration: false`.
- Main-process modules for workspace scanning, active-workspace read/write, ProPresenter
  process/app control, IPC, config, and logging.
- Renderer list view that marks the active workspace and shows ProPresenter installed/running
  state.
- PP-closed launch path: validate the workspace folder, write preferences, verify readback,
  launch ProPresenter, and close the splash window.
- Graceful states for ProPresenter not found, empty workspace list, inaccessible folders, and
  preference read/write failures.

### Phase 2: Running-ProPresenter Flow

Implemented:

- Exact running-state check using the ProPresenter process name.
- Confirmation modal before quitting ProPresenter for a workspace switch.
- Process-level close request to avoid ProPresenter's own quit prompt, then polling until the main
  app terminates.
- Timeout error if ProPresenter does not close.
- Fast path for selecting the already-active workspace while ProPresenter is running: focus
  ProPresenter without rewriting preferences or restarting it.

### Phase 3: Hardening

Implemented:

- Manual rescan button.
- Custom workspace folder picker with persisted config.
- Support log under Electron `userData`.
- Copyable support details from visible errors.
- ProPresenter download link when the app is not installed.
- Startup fallback to the standard workspace root if launcher config is missing or malformed.

### Phase 4: Packaging & Internal Release

Configured:

- `electron-builder` macOS packaging with DMG and zip targets.
- Hardened runtime.
- App and inherited entitlements files.
- Apple Events usage string for locate/focus fallback paths.
- Built-in notarization enabled for release builds when Apple credentials are present.
- GitHub Actions release workflow for signed/notarized macOS artifacts when repository secrets
  are configured.

Not performed in this worktree:

- Actual Developer ID signing and Apple notarization. Those require a valid Apple Developer
  Program team, a Developer ID Application certificate, and notarization credentials on the
  release machine or CI runner.

See `docs/release.md` for release commands and verification gates.

### Phase 5: Public-Distribution Readiness

Implemented/scaffolded:

- `electron-updater` integration that runs only in packaged builds.
- GitHub Releases publish/feed configuration for `Sambro09/propresenter-splash`.
- Release workflow that builds, notarizes, publishes, and uploads macOS artifacts.
- Local-only diagnostics logging for unhandled main-process errors and renderer/child process
  exits.
- Support guide in `docs/support.md`.
- Compatibility and update-feed test matrix in `docs/testing-matrix.md`.

Not implemented by design:

- Remote crash/usage telemetry. The app currently keeps diagnostics local because no privacy
  policy, endpoint, or stakeholder decision exists for remote collection.
- Workspace management features from §13. They remain explicit future enhancements outside the
  minimal launcher scope.

## Local ProPresenter Findings

Observed on this machine:

- App path: `~/Applications/ProPresenter.app`
- Bundle identifier: `com.renewedvision.propresenter`
- Version: `21.4` / `21.4.0`
- Preferences domain: `com.renewedvision.propresenter`
- Preferences file: `~/Library/Preferences/com.renewedvision.propresenter.plist`
- Support root: `~/Library/Application Support/RenewedVision/ProPresenter`
- User workspace root: `~/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces`

Relevant preference keys:

- `applicationShowDirectory`
- `userWorkspaces`, an `NSData` preference containing UTF-8 JSON array bytes.

## Commands

Development:

```sh
npm install
npm run dev
```

Verification:

```sh
npm run typecheck
npm run build
npx electron-builder --mac --dir --config.mac.notarize=false --config.mac.identity=null
```

Release:

```sh
npm run dist
npm run release
```

`npm run dist` expects a Developer ID signing identity plus notarization credentials.
`npm run release` also expects `GH_TOKEN` so electron-builder can publish to GitHub Releases.
Use `docs/release.md` as the release checklist.

## Setup References

- Apple Support: [Open items automatically when you log in on Mac](https://support.apple.com/guide/mac-help/open-items-automatically-when-you-log-in-mh15189/mac)
- Apple Platform Deployment: [Manage login items and background tasks on Mac](https://support.apple.com/guide/deployment/manage-login-items-background-tasks-mac-depdca572563/web)
- Apple Platform Deployment: [Autonomous Single App Mode payload settings for Mac](https://support.apple.com/guide/deployment/autonomous-single-app-mode-payload-settings-dep8a42c4c4a/web)

## Remaining Risks

- The ProPresenter active-workspace mechanism is undocumented and could change in future
  ProPresenter releases.
- The `userWorkspaces` JSON contains `minimumRequiredProPresenterVersion: "22.0.0"` despite
  this local app reporting `21.4.0`; the launcher intentionally does not use that field for
  compatibility gating.
- Custom workspace folders are user-selected; the app validates directory access but does not
  create or repair ProPresenter registry entries.
- Public distribution still requires executing the compatibility matrix on additional
  ProPresenter/macOS versions and deciding whether remote diagnostics are appropriate.
