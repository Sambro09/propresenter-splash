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
4. Remove ProPresenter from macOS Login Items. ProPresenter must not open before the launcher.
5. Remove unrelated apps from Login Items for the shared presentation account.
6. Pin or move common service workspaces in Edit Mode.
7. After a test launch, use the ProPresenter Splash menu-bar item to show the launcher and verify
   **Choose Another Workspace** can start a confirmed switch.

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

### Workspace Switch Fails

Do not launch ProPresenter manually until the copied support details have been saved. A switch
failure usually means the selected folder was deleted, the `userWorkspaces` preference is
missing/malformed, or macOS blocked preference access.

## Privacy

ProPresenter Splash records local logs for support. It does not collect usage analytics, upload
crash reports, or send workspace names/paths to a remote service.
