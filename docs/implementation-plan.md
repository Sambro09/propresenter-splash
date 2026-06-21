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
