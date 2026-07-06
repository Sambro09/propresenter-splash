# ProPresenter Splash Roadmap

Status: future implementation backlog
Last updated: 2026-07-05

Use this as the single planning document for work beyond the implemented launcher. The product
contract and v1 behavior live in `docs/spec.md`.

## Current Baseline

Implemented or scaffolded:

- Electron + TypeScript + Vite app with isolated preload bridge and React renderer.
- Workspace discovery from ProPresenter's `UserWorkspaces` folder and `userWorkspaces`
  preference registry.
- Active workspace detection and launch-by-selection for ProPresenter 21.4.
- Running-ProPresenter switch flow with a save warning, quit/wait, preference write, and relaunch.
- Edit Mode for workspace folder selection, renaming/repointing, pinning, ordering, login item,
  and focused startup mode.
- Menu-bar control surface, minimized/backgrounded ProPresenter detection, and session handoff
  actions.
- macOS packaging, signing/notarization configuration, GitHub release workflow, and update-feed
  scaffolding.

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
- **Public update readiness:** complete update-feed validation against signed/notarized releases
  before enabling broad auto-updates.

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
- Avoid Mac App Store distribution unless the architecture changes, because sandboxing blocks
  direct access to ProPresenter support files and preferences.
