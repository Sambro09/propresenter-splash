# Compatibility Test Matrix

Run this matrix before public distribution and after ProPresenter updates.

## ProPresenter Versions

| ProPresenter Version | macOS Version | Status | Notes |
|---|---|---|---|
| 21.4 | macOS 15.6 | Validated locally | Phase 0 preference contract confirmed. |
| 21.x latest | macOS 13+ | Pending | Required before a broader release. |
| Next major | macOS current | Pending | Re-run Phase 0 preference validation before claiming support. |

## Acceptance Tests

For each tested ProPresenter/macOS combination:

1. Create or identify at least two workspaces.
2. With ProPresenter closed, open ProPresenter Splash and verify all workspaces are listed.
3. Confirm the active workspace badge matches ProPresenter's Settings view.
4. Select a different workspace and verify ProPresenter launches into exactly that workspace.
5. With ProPresenter running, select a different workspace and verify the ProPresenter Splash save warning,
   no extra ProPresenter quit prompt, preference write, and relaunch.
6. With ProPresenter running, select the already-active workspace and verify ProPresenter is
   focused without restart.
7. Temporarily rename the workspace folder and verify the empty/error state does not crash.
8. Test a relocated `UserWorkspaces` folder through **Choose folder**.
9. Enable Edit Mode, pin/move workspaces, restart the launcher, and verify the order persists.
10. Build a signed/notarized artifact and verify `codesign`, `spctl`, and `stapler`.

## Minimize Resilience Tests

Run these with a workspace launched from ProPresenter Splash:

1. Minimize ProPresenter and wait past the roughly 5 second debounce. Verify the splash
   reappears without taking keyboard focus, the banner says ProPresenter is still open but
   minimized, and the tray header reads "ProPresenter minimized".
2. Un-minimize ProPresenter and verify the banner clears within one debounce window. While
   ProPresenter stays frontmost presenting, verify the splash never reveals itself (no focus
   steal mid-service).
3. With ProPresenter minimized, use only the menu-bar icon: verify **Show ProPresenter Splash**
   brings the splash forward, and **Switch Workspace...** triggers the confirm-quit, switch,
   and relaunch flow.
4. Use **Quit ProPresenter** from the menu-bar icon and verify a confirmation dialog always
   appears before quitting. Cancel the dialog and verify ProPresenter keeps running.
5. Switch macOS between light and dark menu bars and verify the tray icon tints correctly in
   both (template image).
6. Deny or remove the Accessibility permission for ProPresenter Splash. Verify the app does
   not crash and that detection degrades: the state may report background instead of
   minimized, or unknown. Grant the permission in System Settings → Privacy & Security →
   Accessibility and verify precise minimized detection resumes.
7. Repeat cases 1 and 5 on a signed/notarized packaged build. Verify the tray icon assets load
   and the Accessibility and Apple Events permission behavior matches expectations (packaged
   builds behave differently from `npm run dev`).

## Operator Workflow Test

Run this before installing on a shared presentation Mac:

1. Enable **Launch at login** from the launcher's Edit Mode or add the launcher as a Login Item
   for the shared presentation account.
2. Remove ProPresenter and unrelated apps from Login Items.
3. Log out of macOS, then log back in as the shared presentation user.
4. Verify the launcher appears first and ProPresenter does not open before workspace selection.
5. Select each common service workspace and verify ProPresenter opens in the selected workspace.
6. Finish or switch from the ProPresenter Splash menu-bar item: use **Show ProPresenter
   Splash** or **Switch Workspace...** and verify the operator has a clear path to log out or
   choose another workspace without quitting ProPresenter.
7. Quit ProPresenter anyway and verify the launcher still returns on the Session Finished
   screen with the same log out, switch, and reopen options.
8. Use **Reopen Last Workspace** and verify the same workspace opens again.
9. Use **Log Out** and verify macOS shows its normal logout confirmation.
10. Reboot the Mac and verify the same first-screen behavior after login.

## Update Feed Test

Before enabling broad public updates:

1. Publish a signed/notarized `v0.1.0` release.
2. Install that release on a clean Mac.
3. Publish a higher patch version to GitHub Releases.
4. Confirm the installed app checks the GitHub feed, downloads the update, and installs it on
   app quit.
