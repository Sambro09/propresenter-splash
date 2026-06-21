# ProPresenter Workspace Launcher Implementation Plan

Status: Phase 0 validated locally
Date: 2026-06-21

## Current State

The repository currently contains docs only; no app source has been scaffolded yet.
Phase 0 has validated the core active-workspace mechanism for the installed ProPresenter 21.4
copy. See `docs/phase0-findings.md` for the detailed evidence and command sequence.

## Local ProPresenter Findings

Observed on this machine:

- App path: `~/Applications/ProPresenter.app`
- Bundle identifier: `com.renewedvision.propresenter`
- Version: `21.4` / `21.4.0`
- Preferences domain: `com.renewedvision.propresenter`
- Preferences file: `~/Library/Preferences/com.renewedvision.propresenter.plist`
- Support root: `~/Library/Application Support/RenewedVision/ProPresenter`
- User workspace root: `~/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces`

This differs from the draft spec in two important ways:

- The bundle/preference identifier is lowercase: `com.renewedvision.propresenter`.
- The user workspace directory is `UserWorkspaces`, not `User Workspaces`.

Workspaces currently found under `UserWorkspaces`:

- `Facilities`
- `Kids`
- `Traditions`
- `Youth`

The active workspace was originally `Kids`. Phase 0 temporarily switched to `Youth` through
preferences, launched ProPresenter successfully, verified persistence after quit, and restored
the original `Kids` baseline.

Relevant preference keys:

- `applicationShowDirectory` is set to
  `~/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces/Kids`.
- `userWorkspaces` is an `NSData` preference containing a JSON array. Decoded shape:

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

The real value contains one object per workspace. Only `Kids` currently has `isActive: true`.

Process detection note:

- `ProPresenter` itself is not currently running.
- ProPresenter helper processes may remain running, so app-running detection must not use a
  loose process-name match. Use exact `ProPresenter` process detection, Launch Services, or
  AppleScript running-state checks.

## Validated Active-Workspace Mechanism

For ProPresenter 21.4 on this machine, active workspace selection is preference-backed.

To switch workspaces externally, the launcher should update both:

1. `applicationShowDirectory` to the selected workspace path.
2. `userWorkspaces` so exactly one workspace has `isActive: true`.

This was validated by switching from `Kids` to `Youth` while ProPresenter was closed, launching
ProPresenter, observing ProPresenter update its saved library path to the `Youth` workspace,
quitting, and confirming the active state did not revert.

## Phase 0 Outcome

Phase 0 is complete enough to proceed with implementation.

Confirmed:

- exact preference domain: `com.renewedvision.propresenter`
- exact default workspace root: `~/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces`
- active directory key: `applicationShowDirectory`
- workspace registry key: `userWorkspaces`
- `userWorkspaces` encoding: `NSData` containing UTF-8 JSON array bytes
- write method: `defaults write ... applicationShowDirectory -string ...` plus
  `defaults write ... userWorkspaces -data <hex>`
- launch behavior: ProPresenter accepted the external switch and did not revert after quit

Not required for v1 implementation, but still useful later:

- Manual in-app Active Workspace switch diff for comparison with the externally written state.

## Recommended Build Plan

### Phase 1: Scaffold + Read-Only MVP

Create an Electron + TypeScript + Vite app with a minimal renderer. Keep all ProPresenter
integration in the main process.

Initial modules:

- `proPresenterLocator`: resolve app path by bundle id and fallback common locations.
- `workspaceScanner`: list directories under `UserWorkspaces`; merge with decoded
  `userWorkspaces` preference when present.
- `activeWorkspace`: read `applicationShowDirectory` and decoded `userWorkspaces`.
- `proPresenterController`: detect exact running app state; launch/focus by resolved app path.
- `ipc`: typed bridge for `listWorkspaces`, `getActiveWorkspace`, `launchWorkspace`, and
  `rescan`.

At the end of this phase the app should list workspaces and clearly mark the active one.
Switching can land in Phase 2 using the validated preference write contract.

### Phase 2: PP-Closed Switching

Implement switching while ProPresenter is closed:

- Validate selected workspace still exists.
- Update active workspace preferences through `defaults` or another cfprefsd-aware API.
- Re-read preferences after write and abort if they do not match.
- Launch ProPresenter.
- Close the splash window after successful launch.

### Phase 3: Running-ProPresenter Flow

Add running-state handling:

- If selected workspace is already active and ProPresenter is running, focus ProPresenter.
- Otherwise show a confirmation dialog warning the user to save work.
- Quit ProPresenter gracefully.
- Wait until exact main process termination; ignore helper processes.
- Write active workspace.
- Launch ProPresenter.

### Phase 4: Hardening

Add:

- empty state
- ProPresenter-not-found state
- manual rescan
- custom workspace folder fallback
- copyable support details
- basic file logging for failed reads/writes/launches

### Phase 5: Packaging

Package as a direct-distribution macOS app:

- non-sandboxed
- hardened runtime
- Developer ID signing
- notarized and stapled
- DMG and zip outputs through `electron-builder`

## Decisions To Carry Into Implementation

- Use `com.renewedvision.propresenter` as the default bundle id/domain.
- Use `UserWorkspaces` as the default workspace folder.
- Treat the preference registry as the source of display names and active state when available.
- Treat folder names as fallback display names.
- Keep all ProPresenter-specific paths and keys centralized in one module.
- Do not parse or modify workspace content files for v1.
- Do not match helper processes as "ProPresenter is running".

## Remaining Risks

- The `userWorkspaces` JSON contains `minimumRequiredProPresenterVersion: "22.0.0"` despite
  this local app reporting `21.4.0`; do not use that field for compatibility gating until it is
  understood.
- No additional required active-workspace state was observed, but future testing should keep
  checking for schema changes.
- ProPresenter may rewrite preferences on quit if switching is attempted while it is running.
- Future ProPresenter versions could change the preference schema.
