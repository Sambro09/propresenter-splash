# Plan: Minimize Resilience (Menu-Bar Control + Minimized Detection)

Status: proposed
Date: 2026-07-05
Owner: TBD

## Problem

Operators frequently **minimize ProPresenter instead of quitting it** when they finish.
Because the entire launcher lifecycle is keyed off ProPresenter's *process* exiting, a
minimized-but-running ProPresenter silently breaks the hand-back-to-the-splash flow.

### Root cause (grounded in the code)

- `src/main/sessionController.ts` polls `isProPresenterRunning()` every 500 ms. It fires
  `endProPresenterSession()` — which restores/shows/focuses the splash and renders the
  `SessionEndedScreen` — only when ProPresenter's process disappears.
- `src/main/proPresenterController.ts` → `isProPresenterRunning()` checks LaunchServices +
  `pgrep`. **A minimized window is still a live process**, so the "ended" signal never fires.
- After a launch, `beginSessionAndHideWindow()` in `src/main/index.ts` calls `window.hide()`.
  The splash is therefore hidden *and* the "come back" trigger never runs → the control
  surface is buried with no way back for a non-technical volunteer.

Switching workspaces technically still works while ProPresenter runs (the `confirmQuit`
path in `launchWorkspace`), but only if someone digs the splash back out — which is exactly
what they are not doing.

**The real failure is not "we can't switch while PP runs" — it is "the control surface
disappears and nobody knows how to get it back."**

## Hard safety constraint

Operators routinely minimize ProPresenter **on purpose during a live service** (the control
window is hidden while output continues to the projector/screen). Therefore:

> **Never auto-quit ProPresenter as a reaction to minimize.** Quitting must always be an
> explicit, confirmed operator action.

This rules out the naive "quit on minimize" fix and shapes every decision below.

## Chosen approach

Per decision, we implement **Option 1 + Option 3, with Option 2**:

1. **Menu-bar (tray) control surface — make the splash omnipresent.** A status-bar item is
   always reachable regardless of ProPresenter's window state. From it the operator can
   switch workspace, bring the splash forward, bring ProPresenter to the front, or quit
   ProPresenter (confirmed). This attacks the root cause structurally: the control surface
   can no longer be buried.
2. **Minimized-but-running detection & gentle surface.** Extend the session watcher to notice
   that ProPresenter is running but minimized/backgrounded, reflect that in the tray, and
   *gently* resurface the splash (without stealing keyboard focus) plus a non-blocking banner.
   Turns the silent stuck state into a visible, one-click-recoverable one.
3. **Copy / mental-model reframe.** Stop instructing users to "quit ProPresenter." Reframe
   "done" as a Splash action so minimize-vs-quit stops mattering.

Everything reuses the existing `launchWorkspace()` confirm-quit machinery — no new
workspace-switching logic.

## Design overview

```
                       ┌──────────────────────────────┐
   menu bar (Tray)  ─► │  shared launch/raise helpers  │ ◄─ IPC handlers (renderer)
                       │  (windowManager + one launch  │
   session watcher  ─► │   path, extracted in Phase 0) │ ◄─ session watcher (auto-surface)
                       └──────────────────────────────┘
```

- **Phase 0** extracts the launch + raise-to-front + begin-session-and-hide flow so the tray,
  the IPC handlers, and the watcher all call one code path.
- **Phase 1** adds the Tray on top of that shared path.
- **Phase 2** adds window-state sampling to the watcher and a renderer banner.
- **Phase 3** updates copy across the renderer and docs.
- **Phase 4** covers tests, permissions, and release.

Each phase is independently shippable and leaves the app in a working state.

---

## Phase 0 — Shared launch/raise refactor (enabler)

Goal: one reusable code path for "launch a workspace and hand off" and "raise the splash,"
so later phases don't duplicate the logic currently inlined in `src/main/index.ts`.

Changes:
- New `src/main/windowManager.ts`: move `raiseToFront()` here and add a
  `getMainWindow()`/`revealMainWindow({ steal }: { steal: boolean })` helper. Keep a
  module-level reference to the main `BrowserWindow`.
- New `src/main/workspaceLauncher.ts` (or a function in `launcherService.ts`):
  `runWorkspaceLaunch(workspaceId, options)` that wraps `launchWorkspace()` + on success
  `beginProPresenterSession()` + the delayed `window.hide()`. This is what the IPC
  `launcher:launch-workspace` handler currently does inline in `index.ts` — extract it.
- Update `src/main/index.ts` to call the extracted helpers (behavior unchanged).

Acceptance:
- App builds and runs exactly as before; launching a workspace still hides the window and
  begins a session. No user-visible change. `npm run typecheck` + existing tests pass.

Risk: low (pure refactor). Do this first to avoid divergent copies of the launch flow.

---

## Phase 1 — Menu-bar (tray) control surface (Option 1)

Goal: with ProPresenter minimized, an operator can do everything they need from the menu bar.

Changes:
- Assets: add a macOS **template** tray icon `build/trayTemplate.png` (+ `@2x`). The
  `…Template.png` suffix lets macOS auto-tint for light/dark menu bars.
- New `src/main/tray.ts`:
  - `createTray()` — instantiate `Tray`, hold a module-level ref (so it is not GC'd),
    build the menu, and return an `updateTrayMenu()` callback.
  - Menu contents (rebuilt on each state change):
    - Disabled header line: current status — e.g. `Running: Sunday Service`,
      `ProPresenter minimized`, or `No workspace open`.
    - `Switch Workspace…` submenu, one item per scanned workspace (from `scanWorkspaces()`),
      each `click` → `runWorkspaceLaunch(id, { confirmQuit: true })` from Phase 0. The
      confirm-quit dialog protects a live service.
    - `Show ProPresenter Splash` → `revealMainWindow({ steal: true })`.
    - `Bring ProPresenter to Front` → `focusProPresenter(appPath)` (shown when running).
    - `Quit ProPresenter` → confirm dialog, then `quitProPresenterAndWait()`. **Confirmed,
      never automatic.**
    - Separator, then `Quit ProPresenter Splash`.
- Wire-up in `src/main/index.ts`: call `createTray()` in `app.whenReady()`; call
  `updateTrayMenu()` whenever session state transitions (from `sessionController`) or after a
  workspace rescan.
- Let `sessionController` notify the tray: add a lightweight `onSessionChange` subscription
  (or have `index.ts` pass `updateTrayMenu` into the session/emit path) so the tray title
  tracks `idle` / `running` / `ended`.
- Optional (nice-to-have, can defer): register a global shortcut
  `globalShortcut.register('CommandOrControl+Alt+Space', () => revealMainWindow({ steal: true }))`
  and unregister on `will-quit`.

Acceptance:
- Launch a workspace, then **minimize ProPresenter**. Using only the menu-bar icon:
  - `Show ProPresenter Splash` brings the splash forward.
  - `Switch Workspace…` → another workspace triggers the confirm-quit → switch → relaunch.
  - `Quit ProPresenter` prompts for confirmation before quitting.
- Tray header text reflects the current running workspace.
- Closing the splash window keeps the app alive in the menu bar (already true on macOS via
  `window-all-closed`).

Risk: medium. Tray GC (must retain the ref), and keeping menu state fresh. Icon must be a
proper template image or it will look wrong in dark mode.

---

## Phase 2 — Minimized-but-running detection & gentle surface (Option 2)

Goal: when ProPresenter sits minimized/backgrounded, make it visible and recoverable —
without ever stealing focus during a live service.

Changes:
- `src/main/proPresenterController.ts`: add `getProPresenterWindowState()` returning
  `'foreground' | 'background' | 'minimized' | 'unknown'`.
  - **Primary strategy (precise):** AppleScript via System Events reading `AXMinimized` on
    ProPresenter's windows. Requires the **Accessibility** permission (stronger than the Apple
    Events permission we already declare) — see Open Questions.
  - **Fallback strategy (Apple-Events only):** treat "ProPresenter running but not the
    frontmost application" as `background`. Less precise (also true when the operator
    Cmd-Tabs away), but needs no new permission. Resolve which to ship in this phase.
- `src/shared/types.ts`: extend `SessionState` with `proPresenterWindow?: 'foreground' |
  'background' | 'minimized' | 'unknown'` (optional → backward compatible).
- `src/main/sessionController.ts`:
  - While `status === 'running'`, also sample window state on the existing 500 ms poll.
  - **Debounce**: only treat it as "minimized/backgrounded" after it stays that way for a
    sustained window (e.g. ≥ 5 s) to avoid reacting to transient minimize/switch.
  - On a sustained transition into minimized/background: update `sessionState`, emit it, and
    **gently** reveal the splash via `window.showInactive()` (no `focus`, no `app.focus({steal})`)
    so it is discoverable but does not disrupt output. Reveal at most once per transition
    (don't fight the operator if they re-minimize).
  - Update the tray title through the Phase 1 hook.
- `src/renderer/src/App.tsx`: when `sessionState.proPresenterWindow` is `minimized`/`background`
  and status is `running`, render a non-blocking banner (reuse the existing `.banner info`
  pattern near the alerts block): "ProPresenter is still open but minimized." with buttons
  **Bring to front** (`focusProPresenter` via a new IPC) and **Switch workspace** (returns to
  the library / triggers `confirmQuit`). Never an auto-quit button in this banner.

Acceptance:
- Launch a workspace, minimize ProPresenter, wait past the debounce: the splash reappears
  **inactive** (does not grab keyboard focus) with the banner; the tray header reads
  "ProPresenter minimized."
- Un-minimizing ProPresenter clears the banner within one debounce window.
- No focus steal occurs while ProPresenter is in the foreground presenting.

Risk: medium-high. The Accessibility permission is real friction on shared/kiosk Macs;
`showInactive` behavior during full-screen output needs on-device verification.

---

## Phase 3 — Copy & docs reframe (Option 3)

Goal: no surface tells the operator that quitting ProPresenter is the required step.

Changes:
- `src/renderer/src/App.tsx` (`SessionEndedScreen` + minimized banner copy): reframe around
  "switch/finish from the Splash (menu bar)," not "quit ProPresenter." Add a one-line hint:
  "You don't need to quit ProPresenter — use the ProPresenter Splash menu-bar icon to switch."
- `docs/implementation-plan.md` → Operator Workflow: revise step 5 ("they quit ProPresenter")
  to describe finishing/switching from the Splash, and mention the menu-bar item.
- `docs/support.md`: add a short "ProPresenter is minimized / I can't find the launcher" entry
  pointing at the menu-bar icon.

Acceptance:
- A reviewer reading the SessionEndedScreen, the minimized banner, and the operator docs finds
  no instruction that requires quitting ProPresenter; the menu-bar path is described.

Risk: low.

---

## Phase 4 — Testing, permissions, release

Changes / tasks:
- **Unit tests (vitest):** pure logic added in Phases 1–2 — window-state string parsing from
  the AppleScript output, and the debounce/transition state machine in the session watcher
  (extract the transition decision into a pure function to keep it testable).
- **`docs/testing-matrix.md`:** add manual cases — minimize→resurface, tray switch while
  minimized, tray Quit ProPresenter confirmation, global shortcut (if shipped), dark/light
  tray icon, permission-denied fallback path.
- **Permissions / entitlements:** if Phase 2 ships the AX strategy, document the Accessibility
  grant in support docs and verify behavior when the grant is absent (must degrade to the
  fallback, not crash). The existing `NSAppleEventsUsageDescription` already covers Apple
  Events automation.
- **Release:** bump version in `package.json`, sign/notarize, smoke-test the packaged build
  (tray icons and permissions behave differently in a notarized bundle than in `dev`).

Acceptance:
- `npm run typecheck`, `npm run test`, and a packaged smoke build all pass; testing-matrix
  cases verified on a real shared-Mac profile.

---

## File change map (summary)

| Area | Files |
| --- | --- |
| Phase 0 | `src/main/index.ts`, new `src/main/windowManager.ts`, new `src/main/workspaceLauncher.ts` (or `launcherService.ts`) |
| Phase 1 | new `src/main/tray.ts`, `src/main/index.ts`, `src/main/sessionController.ts`, `build/trayTemplate.png` (+`@2x`) |
| Phase 2 | `src/main/proPresenterController.ts`, `src/main/sessionController.ts`, `src/shared/types.ts`, `src/preload/index.ts` (new focus/bring-to-front IPC), `src/renderer/src/App.tsx` |
| Phase 3 | `src/renderer/src/App.tsx`, `docs/implementation-plan.md`, `docs/support.md` |
| Phase 4 | `test/*`, `docs/testing-matrix.md`, `package.json` |

## Open questions / decisions to make

1. **Minimize detection strategy (Phase 2):** ship the precise AX/`AXMinimized` check (needs
   Accessibility permission) or the Apple-Events-only "not frontmost" proxy (no new permission,
   less precise)? Recommendation: try AX first; keep the frontmost proxy as the documented
   fallback if the shared-Mac permission friction is unacceptable.
2. **Auto-surface aggressiveness (Phase 2):** confirm `showInactive()` (no focus steal) is the
   right default. A focus-stealing reveal is safer to *notice* but dangerous mid-service.
3. **Global shortcut (Phase 1):** ship in Phase 1 or defer? It is optional polish.
4. **Tray-only vs Dock + tray:** we keep both (Dock window + menu-bar item). Confirm we do not
   want a menu-bar-only (LSUIElement) mode for kiosk installs — that would be a separate change.

## Non-goals

- Disabling ProPresenter's minimize button (it is a third-party app we do not control).
- Any automatic quitting of ProPresenter based on window state or idle time.
- Changing the workspace-switch mechanism itself (we reuse `launchWorkspace` + `confirmQuit`).
