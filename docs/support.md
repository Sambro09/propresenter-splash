# Support Guide

Use this for first-line support on installed church machines.

## What To Ask For

Ask the user to open ProPresenter Splash and use **Copy details** from any visible error. The copied
details include:

- Workspace root
- Active workspace
- ProPresenter install path
- ProPresenter running state
- Visible ProPresenter Splash errors
- Workspace list
- Support log path

The support log is stored in Electron's app data folder as `propresenter-splash.log`. It contains
local diagnostic events only. ProPresenter Splash does not send telemetry or crash reports to a
remote server.

## Shared Mac Setup

For each presentation Mac:

1. Install ProPresenter Splash in `/Applications`.
2. Open ProPresenter Splash, enable **Edit Mode** from the Workspaces menu, and turn on
   **Launch at login**.
3. Leave **Focused startup mode** enabled for the shared presentation account.
4. Open **System Settings → Privacy & Security → Accessibility** and enable **ProPresenter
   Splash**. If it is not listed, add it with the **+** button. See **Accessibility Permission**
   below.
5. Remove ProPresenter from macOS Login Items. ProPresenter must not open before the launcher.
6. Remove unrelated apps from Login Items for the shared presentation account.
7. Pin or move common service workspaces in Edit Mode.
8. After a test launch, use the ProPresenter Splash menu-bar item to show the launcher and verify
   **Choose Another Workspace** can start a confirmed switch.

## Accessibility Permission

ProPresenter Splash uses the macOS Accessibility permission to detect precisely when
ProPresenter is minimized. With that permission, the launcher can resurface itself and show the
minimized banner instead of staying hidden.

To grant it:

1. Open **System Settings → Privacy & Security → Accessibility**.
2. Enable **ProPresenter Splash**. If it is not listed, click **+** and add ProPresenter Splash
   from `/Applications`.

macOS does not show a pop-up for this permission. ProPresenter Splash may appear in the
Accessibility list after its first minimized check, or it can be added manually with **+**.

Without the permission, everything still works and the app does not crash. ProPresenter Splash
falls back to a less precise check that can only tell whether ProPresenter is frontmost, so the
minimized banner may not appear, or it may say ProPresenter is in the background.

## Common Cases

### ProPresenter Not Found

Confirm ProPresenter is installed and opens normally. ProPresenter Splash resolves ProPresenter by
bundle identifier, then searches common install paths and Spotlight results.

### No Workspaces Found

Confirm the workspace folder exists. The default is:

```text
~/Library/Application Support/RenewedVision/ProPresenter/UserWorkspaces
```

If the church relocated ProPresenter support files, use **Choose folder** in ProPresenter Splash
and select the relocated `UserWorkspaces` folder.

### ProPresenter Could Not Close During Switch

ProPresenter Splash asks the operator to save work first, then sends ProPresenter a normal
termination signal so ProPresenter's own extra quit confirmation does not block the workspace
switch. If ProPresenter Splash still reports that ProPresenter did not close, confirm the service
is no longer live, close ProPresenter manually, and retry the workspace launch.

### ProPresenter Is Minimized Or The Launcher Is Missing

Use the ProPresenter Splash icon in the macOS menu bar. From there, choose **Show ProPresenter
Splash** to bring the launcher back, or use **Switch Workspace...** to start the save-confirm-switch
flow. Operators do not need to quit ProPresenter to switch from the Splash menu-bar item.

If the launcher never resurfaces on its own and the minimized banner does not appear, check the
**Accessibility Permission** section above.

### Workspace Switch Fails

Do not launch ProPresenter manually until the copied support details have been saved. A switch
failure usually means the selected folder was deleted, the `userWorkspaces` preference is
missing/malformed, or macOS blocked preference access.

## Privacy

ProPresenter Splash records local logs for support. It does not collect usage analytics, upload
crash reports, or send workspace names/paths to a remote service.
