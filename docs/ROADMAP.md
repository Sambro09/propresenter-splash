# ProPresenter Splash Roadmap

Status: future implementation backlog
Last updated: 2026-08-27

Use this as the single planning document for work beyond the implemented launcher. The product
contract and v1 behavior live in `docs/spec.md`.

## Current Baseline

Implemented or scaffolded:

- Electron + TypeScript + Vite app with isolated preload bridge and React renderer.
- Workspace discovery from ProPresenter's `UserWorkspaces` folder and `userWorkspaces`
  preference registry. Startup now shows the last valid cached list while one shared background
  scan refreshes the cache and records discovery timings.
- Active workspace detection and launch-by-selection for ProPresenter 21.4.
- Running-ProPresenter switch flow with a save warning, quit/wait, preference write, and relaunch.
- Edit Mode for workspace folder selection, renaming/repointing, pinning, ordering, login item,
  and the session-end system action.
- First-run Launch at Login permission, default-on registration, and a System Settings handoff
  when macOS reports that the login item still needs approval.
- Menu-bar control surface, minimized/backgrounded ProPresenter detection, and session handoff
  actions.
- macOS packaging, signing/notarization configuration, GitHub release workflow, and update-feed
  scaffolding.

## Next Version

- [x] **Faster workspace discovery** *(completed 2026-08-27):* show the last valid cached list at
  startup, coalesce concurrent discovery requests, refresh the list in the background, and log
  cache and full-scan timings.
- **Predictable workspace config transfer:** replace broad or repeated config copying with one
  explicit transfer plan. Copy only supported settings, validate the source and destination,
  preserve a backup, write changes atomically, and report exactly what changed. Never copy
  presentation content or machine-specific paths by accident.
- [x] **Configurable session-end action** *(completed 2026-08-27):* let an admin choose `Log Out`
  or `Shut Down` for the main action shown after ProPresenter closes. Always show
  `Open Most Recent Workspace` and `Choose Other Workspace`.

### Configurable Session-End Screen Plan

#### Product behavior

- Put an **End screen** two-choice toggle for `Log Out` or `Shut Down` in the main Edit Mode
  settings row.
- Always show `Open Most Recent Workspace` and `Choose Other Workspace` on the end screen.
- Default to `Log Out`. Existing installs keep their current system action.
- Apply changes without an app restart and persist them per Mac.
- Use the selected system action in the button label, icon, help text, busy state, success message,
  error message, and macOS confirmation request.
- Always open the launcher in focused startup mode. Do not expose a setting for this behavior.

#### Data and API design

- Add one settings object instead of three unrelated configuration fields:

  ```ts
  interface SessionEndSettings {
    systemAction: 'logout' | 'shutdown';
  }
  ```

- Store the object in `config.json` and expose it through `LauncherSettings`. Treat a missing or
  malformed object as the safe defaults above so upgrades need no migration step.
- Add one atomic `setSessionEndSettings(patch)` IPC call. Return the updated settings only and
  merge them into renderer state. A settings-only change must not trigger a workspace rescan.
- Replace the logout-specific renderer call with `requestSessionEnd()`. The main process reads the
  saved system action instead of trusting an action supplied by the renderer.

#### Main-process behavior

- Show a native confirmation for both actions before changing system state. If the operator
  confirms, check whether ProPresenter is running, ask it to quit, wait for full termination, and
  stop if it does not close.
- Add the shutdown command beside the existing logout command in one system-action service.
- Keep the end screen open if macOS rejects the request or the command fails. Show a useful error
  and allow the operator to retry. Never fall back from `Shut Down` to `Log Out`, or the reverse.
- Validate the action again in the main process and reject unsupported platforms or values.

#### Renderer work

- Extend the existing Edit Mode admin panel with one End screen control. Disable it while the
  setting is saved, then show the persisted value returned by the main process.
- Pass `SessionEndSettings` into the existing session-ended screen. Render one system-action button
  followed by the two permanent workspace buttons.
- Rename the existing workspace actions to the planned operator-facing labels. Keep the most recent
  workspace name visible on the screen so the operator knows what that button will open.
- Use one `system` busy state instead of separate logout and shutdown states. Keep all visible end
  actions disabled while any end action is running to prevent duplicate requests.

#### Verification and delivery order

1. Add config parsing, defaults, and round-trip tests.
2. Add the shared system-action service and tests for logout, shutdown, ProPresenter quit failure,
   command failure, and invalid settings.
3. Add the typed IPC methods and verify that a settings update does not run workspace discovery.
4. Add the Edit Mode control and permanent workspace buttons.
5. Run type-checks and unit tests. Before release, test both system actions and the first-run login
   item flow in a packaged macOS build on a non-production account.

Acceptance criteria:

- A fresh or upgraded install shows `Log Out`, `Open Most Recent Workspace`, and
  `Choose Other Workspace`.
- Edit Mode can switch the system action between `Log Out` and `Shut Down`.
- The chosen configuration survives an app restart and appears on the next completed session.
- The configured macOS action runs only after ProPresenter has fully closed. A quit or command
  failure leaves the user on the end screen with an error.
- `Open Most Recent Workspace` and `Choose Other Workspace` remain visible for both system actions.

## P1: Rollout Hardening

- **Admin lock:** require an admin gesture or password before Edit Mode, custom folder changes,
  workspace path overrides, ordering changes, or login/startup settings are available.
- **Health check panel:** surface setup issues before volunteers arrive: ProPresenter missing,
  no workspaces found, ProPresenter already running at login, active workspace unreadable,
  preference write failing, missing Accessibility permission, or stale launcher config.
- **Tutorial / onboarding:** add a short first-run tutorial with separate volunteer and admin
  paths. Cover choosing a workspace, switching from the menu-bar item, responding to the save
  warning, recovering when ProPresenter is minimized, and setting up a shared presentation Mac.
- **Per-machine config export/import:** let an admin prepare one Mac and copy launcher settings
  to other presentation machines.
- **Session recovery:** after a reboot or crash while ProPresenter was open, show the launcher
  first on next login and ask the operator to choose a workspace again.

## P2: Multi-Mac And Sync

- **ProPresenter sync support:** help admins verify that ProPresenter's built-in sync workflow is
  configured correctly across machines before relying on the launcher. Show the current workspace
  root, warn about cloud-synced or missing paths, and provide a checklist for matching workspace
  names/locations across Macs.
- **Sync-aware workspace mapping:** allow admins to map equivalent workspaces across machines when
  paths differ but the ministry/service names should stay consistent.
- **Managed deployment support:** provide a signed installer package and MDM notes for churches
  with multiple Macs.
- **Compatibility validation:** test each supported ProPresenter/macOS combination after
  ProPresenter updates, especially the undocumented active-workspace preference contract.
- **First public update validation:** install the last signed version, publish the next version
  through GitHub Releases, and confirm that the app downloads and installs the signed update.
  Test both Apple silicon and Intel Macs before enabling broad rollout.

## P3: Workspace UX And Management

- **Better workspace labels:** support display names and optional short descriptions like
  `Main Auditorium`, `Youth Room`, or `Special Event`.
- **Workspace metadata:** show last used time or modified time when it helps operators choose,
  while keeping recurring service order predictable.
- **Search/filter:** add only if churches accumulate enough workspaces for scanning the list to
  become slow.
- **Workspace management:** create, duplicate, rename, and delete workspaces from the launcher
  once the underlying ProPresenter data contracts are validated.
- **Branding:** optional church logo/name on the splash screen without cluttering the operator
  path.
- **Auto-launch options:** configurable "open most recent workspace" or "keep splash open after
  launch" behavior for sites that want it.

## P4: Broader Distribution

- **Remote diagnostics decision:** decide whether crash or usage reporting is appropriate. Keep
  the current local-only logging model unless there is a privacy policy, endpoint, and stakeholder
  decision.
- **Windows support spike:** investigate `%AppData%\RenewedVision\ProPresenter\LocalWorkspaces`,
  Windows registry/config behavior, process control, and packaging before committing to support.
- **Locked-down mode:** evaluate macOS management options only if there is a real need to prevent
  access to other apps. Keep it separate from the normal launcher handoff workflow.

## Distribution Notes

- Prefer direct download with Developer ID signing and notarization.
- Publish releases only from version tags on `main`. The GitHub workflow must test the app, verify
  its Developer ID signature and notarization ticket, and publish the DMG, ZIP, blockmap, and
  `latest-mac.yml` update manifest together.
- Avoid Mac App Store distribution unless the architecture changes, because sandboxing blocks
  direct access to ProPresenter support files and preferences.
