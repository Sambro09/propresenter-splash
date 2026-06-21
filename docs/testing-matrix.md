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
2. With ProPresenter closed, open the launcher and verify all workspaces are listed.
3. Confirm the active workspace badge matches ProPresenter's Settings view.
4. Select a different workspace and verify ProPresenter launches into exactly that workspace.
5. With ProPresenter running, select a different workspace and verify the launcher save warning,
   no extra ProPresenter quit prompt, preference write, and relaunch.
6. With ProPresenter running, select the already-active workspace and verify ProPresenter is
   focused without restart.
7. Temporarily rename the workspace folder and verify the empty/error state does not crash.
8. Test a relocated `UserWorkspaces` folder through **Choose folder**.
9. Build a signed/notarized artifact and verify `codesign`, `spctl`, and `stapler`.

## Update Feed Test

Before enabling broad public updates:

1. Publish a signed/notarized `v0.1.0` release.
2. Install that release on a clean Mac.
3. Publish a higher patch version to GitHub Releases.
4. Confirm the installed app checks the GitHub feed, downloads the update, and installs it on
   app quit.
